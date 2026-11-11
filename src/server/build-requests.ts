"use server";
import { recordActivity } from "@/lib/activity";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { buildRequests, opportunities, opportunitySkills, profiles, projects, tasks } from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { assertProject, getProjectAccess } from "@/lib/authz";
import { newId } from "@/lib/ids";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { isStaff } from "@/lib/session";
import { ensureSkills } from "@/server/skills";

const requestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().max(80).default(""),
  description: z.string().trim().min(15, "Describe it in a sentence or two so a builder knows what you mean.").max(3000),
  kind: z.enum(["landing", "form", "booking", "store", "other"]),
  builder: z.enum(["community", "team"]),
});

/** Plain-language request. Creates a to-do (and, for the community route, a "Help wanted" listing for a developer). */
export async function createBuildRequest(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("build-request", 10, 3600);
    const input = requestSchema.parse(raw);
    const db = getDb();
    const access = await assertProject(input.projectId, v.id, "task.create", db);
    const title = input.title || (input.description.length > 60 ? `${input.description.slice(0, 57).trimEnd()}…` : input.description);
    const taskId = newId();
    await db.insert(tasks).values({
      id: taskId, projectId: input.projectId, title, description: input.description, deliverable: "A working page the requester can open and approve.",
      contributionType: "code", isCoding: true, createdBy: v.id,
    });
    let opportunityId: string | null = null;
    if (input.builder === "community") {
      opportunityId = newId();
      await db.insert(opportunities).values({
        id: opportunityId, projectId: input.projectId, createdBy: v.id, title: `Web developer: ${title}`.slice(0, 100),
        description: `${input.description}\n\nNo technical setup on our side — you'll get a to-do to claim. Share a preview link when it's ready and we'll review it.`,
        deliverable: "A working page + a link we can open", commitment: "Small project", compensation: "credit",
      });
      const skillIds = await ensureSkills(db, ["Web development"]);
      if (skillIds.length) await db.insert(opportunitySkills).values(skillIds.map((skillId) => ({ opportunityId: opportunityId!, skillId })));
      if (access.project.status === "exploring") await db.update(projects).set({ status: "recruiting" }).where(eq(projects.id, input.projectId));
    }
    const id = newId();
    await db.insert(buildRequests).values({ id, projectId: input.projectId, requestedBy: v.id, title, description: input.description, kind: input.kind, builder: input.builder, taskId, opportunityId });
    if (input.builder === "team") {
      const staff = await db.select({ userId: profiles.userId }).from(profiles).where(inArray(profiles.platformRole, ["admin", "moderator"]));
      await notify(db, staff.map((s) => ({ userId: s.userId, actorId: v.id, type: "approval_request" as const, title: `New build request: ${title}`, body: access.project.title, url: "/admin#builds", projectId: input.projectId })));
    }
    await recordActivity(db, { projectId: input.projectId, actorId: v.id, kind: "build", message: input.builder === "team" ? `${v.profile.displayName} asked the CommonGround team to build “${title}”` : `${v.profile.displayName} is looking for someone to build “${title}”`, url: `/p/${access.project.slug}/build` });
    await audit(db, { actorId: v.id, action: "build_request.create", entityType: "build_request", entityId: id, projectId: input.projectId, metadata: { builder: input.builder, kind: input.kind } });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok({ id }, input.builder === "team" ? "Sent to the CommonGround team. We'll keep you posted here." : "Posted! Developers can now find it under Help wanted.");
  });
}

async function loadRequest(id: string) {
  const db = getDb();
  const [r] = await db.select().from(buildRequests).where(eq(buildRequests.id, id)).limit(1);
  if (!r) throw new ActionError("Request not found.");
  const [p] = await db.select({ slug: projects.slug, title: projects.title }).from(projects).where(eq(projects.id, r.projectId)).limit(1);
  return { db, r, slug: p?.slug ?? "", projectTitle: p?.title ?? "" };
}

const teamSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["start", "review", "live", "cancel"]),
  url: z.string().trim().url().refine((u) => /^https?:\/\//.test(u), "Links must start with http(s)").optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional(),
});

/** CommonGround staff move team requests along. */
export async function teamUpdateBuild(raw: unknown): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("build-team", 60, 600);
    if (!isStaff(v)) throw new ActionError("Not authorized.");
    const input = teamSchema.parse(raw);
    const { db, r, slug } = await loadRequest(input.id);
    if (r.builder !== "team") throw new ActionError("Only team requests are handled here.");
    const patch: Partial<typeof buildRequests.$inferInsert> = { updatedAt: new Date(), note: input.note || r.note };
    let msg = "";
    if (input.action === "start") { patch.status = "building"; patch.builtBy = v.id; msg = "is being built"; }
    if (input.action === "review") {
      if (!input.url) throw new ActionError("Add the preview link so they can check it.");
      patch.status = "review"; patch.previewUrl = input.url; msg = "is ready for your review";
    }
    if (input.action === "live") { patch.status = "live"; patch.liveUrl = input.url || r.previewUrl; msg = "is live"; }
    if (input.action === "cancel") { patch.status = "cancelled"; msg = "was cancelled"; }
    await db.update(buildRequests).set(patch).where(eq(buildRequests.id, r.id));
    if (r.taskId) await db.update(tasks).set({ status: patch.status === "live" ? "done" : patch.status === "review" ? "in_review" : patch.status === "building" ? "in_progress" : undefined, updatedAt: new Date() }).where(eq(tasks.id, r.taskId));
    await recordActivity(db, { projectId: r.projectId, actorId: null, kind: "build", message: `“${r.title}” ${msg}`, url: `/p/${slug}/build` });
    await notify(db, [{ userId: r.requestedBy, actorId: v.id, type: "agent_result", title: `“${r.title}” ${msg}`, body: input.note ?? "", url: `/p/${slug}/build`, projectId: r.projectId }]);
    await audit(db, { actorId: v.id, action: `build_request.${input.action}`, entityType: "build_request", entityId: r.id, projectId: r.projectId });
    revalidatePath("/admin");
    revalidatePath(`/p/${slug}`, "layout");
    return ok(null, "Updated.");
  });
}

/** Requester (or a project admin) approves the team's work or asks for changes. */
export async function respondToBuild(id: string, decision: "approve" | "changes", note = ""): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("build-respond", 30, 600);
    const { db, r, slug } = await loadRequest(id);
    const access = await getProjectAccess({ id: r.projectId }, v.id, db);
    if (r.requestedBy !== v.id && !access?.can("approval.decide")) throw new ActionError("Only the person who asked (or a project admin) can approve this.");
    if (r.builder !== "team" || r.status !== "review") throw new ActionError("This request isn't waiting for review.");
    if (decision === "changes" && !note.trim()) throw new ActionError("Tell the builder what to change.");
    await db.update(buildRequests).set({ status: decision === "approve" ? "live" : "building", liveUrl: decision === "approve" ? r.previewUrl : r.liveUrl, note: note.trim() || r.note, updatedAt: new Date() }).where(eq(buildRequests.id, r.id));
    if (r.taskId) await db.update(tasks).set({ status: decision === "approve" ? "done" : "in_progress", updatedAt: new Date() }).where(eq(tasks.id, r.taskId));
    await recordActivity(db, { projectId: r.projectId, actorId: v.id, kind: "build", message: decision === "approve" ? `“${r.title}” is live 🎉` : `${v.profile.displayName} asked for changes on “${r.title}”`, url: `/p/${slug}/build` });
    if (decision === "changes" && r.builtBy) await notify(db, [{ userId: r.builtBy, actorId: v.id, type: "submission_review", title: `Changes requested on “${r.title}”`, body: note, url: "/admin#builds", projectId: r.projectId }]);
    await audit(db, { actorId: v.id, action: `build_request.${decision}`, entityType: "build_request", entityId: r.id, projectId: r.projectId });
    revalidatePath(`/p/${slug}`, "layout");
    revalidatePath("/admin");
    return ok(null, decision === "approve" ? "🎉 Approved — it's live!" : "Sent back with your notes.");
  });
}

export async function cancelBuildRequest(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("build-respond", 30, 600);
    const { db, r, slug } = await loadRequest(id);
    await assertProject(r.projectId, v.id, "project.view", db);
    const access = await getProjectAccess({ id: r.projectId }, v.id, db);
    if (r.requestedBy !== v.id && !access?.can("task.manage")) throw new ActionError("Only the requester or a project admin can cancel this.");
    await db.update(buildRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(buildRequests.id, r.id));
    if (r.opportunityId) await db.update(opportunities).set({ status: "closed" }).where(and(eq(opportunities.id, r.opportunityId), eq(opportunities.status, "open")));
    revalidatePath(`/p/${slug}`, "layout");
    return ok(null, "Request cancelled.");
  });
}
