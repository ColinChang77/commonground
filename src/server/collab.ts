"use server";
import { recordActivity } from "@/lib/activity";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { applications, opportunities, opportunitySkills, profiles, projectMembers, projects } from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { applicationSchema, opportunitySchema } from "@/lib/validation";
import { newId } from "@/lib/ids";
import { assertProject, getProjectAccess } from "@/lib/authz";
import { notify } from "@/lib/notify";
import { track } from "@/lib/analytics";
import { audit } from "@/lib/audit";
import { ensureSkills } from "@/server/skills";
import { assertNotBlocked } from "@/server/guards";
import { excerpt } from "@/lib/markdown";

export async function createOpportunity(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("opportunity", 20, 3600);
    const input = opportunitySchema.parse(raw);
    const db = getDb();
    const access = await assertProject(input.projectId, v.id, "opportunity.manage", db);
    const id = newId();
    await db.insert(opportunities).values({
      id,
      projectId: input.projectId,
      createdBy: v.id,
      title: input.title,
      description: input.description,
      deliverable: input.deliverable,
      commitment: input.commitment,
      compensation: input.compensation,
      deadline: input.deadline,
    });
    const skillIds = await ensureSkills(db, input.skills);
    if (skillIds.length) await db.insert(opportunitySkills).values(skillIds.map((skillId) => ({ opportunityId: id, skillId })));
    if (access.project.status === "exploring") await db.update(projects).set({ status: "recruiting", updatedAt: new Date() }).where(eq(projects.id, input.projectId));
    revalidatePath(`/p/${access.project.slug}`, "layout");
    revalidatePath("/collaborate");
    return ok({ id }, "Opportunity published.");
  });
}

export async function setOpportunityStatus(opportunityId: string, status: "open" | "closed" | "filled"): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("opportunity", 30, 600);
    if (!["open", "closed", "filled"].includes(status)) throw new ActionError("Unknown status.");
    const db = getDb();
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    if (!o) throw new ActionError("Opportunity not found.");
    const access = await assertProject(o.projectId, v.id, "opportunity.manage", db);
    await db.update(opportunities).set({ status, updatedAt: new Date() }).where(eq(opportunities.id, opportunityId));
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, status === "open" ? "Reopened." : "Closed to new applications.");
  });
}

export async function applyToOpportunity(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("apply", 10, 3600);
    const input = applicationSchema.parse(raw);
    const db = getDb();
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).limit(1);
    if (!o) throw new ActionError("Opportunity not found.");
    const access = await getProjectAccess({ id: o.projectId }, v.id, db);
    if (!access?.can("project.view")) throw new ActionError("Opportunity not found.");
    if (o.status !== "open") throw new ActionError("This opportunity is no longer accepting applications.");
    if (o.deadline && o.deadline.getTime() < Date.now()) throw new ActionError("The application deadline has passed.");
    if (access.role && access.role !== "viewer") throw new ActionError("You're already a member of this project.");
    await assertNotBlocked(db, v.id, access.project.ownerId);
    const [existing] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.opportunityId, o.id), eq(applications.applicantId, v.id)))
      .limit(1);
    let id = existing?.id ?? newId();
    if (existing) {
      if (existing.status === "pending" || existing.status === "accepted") throw new ActionError("You've already applied.");
      // Re-applying after withdrawing/rejection reopens the same record (keeps history single-row).
      await db.update(applications).set({ status: "pending", message: input.message, reviewedBy: null, reviewedAt: null, updatedAt: new Date() }).where(eq(applications.id, existing.id));
    } else {
      id = newId();
      await db.insert(applications).values({ id, opportunityId: o.id, projectId: o.projectId, applicantId: v.id, message: input.message });
    }
    const reviewers = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, o.projectId), inArray(projectMembers.role, ["owner", "admin"])));
    await notify(
      db,
      reviewers.map((r) => ({
        userId: r.userId,
        actorId: v.id,
        type: "application" as const,
        title: `${v.profile.displayName} applied for “${o.title}”`,
        body: excerpt(input.message, 140),
        url: `/p/${access.project.slug}/opportunities?review=${o.id}`,
        projectId: o.projectId,
      })),
    );
    await track(db, "collab.application_submitted", v.id, { projectId: o.projectId, opportunityId: o.id });
    revalidatePath("/collaborate");
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok({ id }, "Application sent.");
  });
}

export async function withdrawApplication(applicationId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("apply", 30, 3600);
    const db = getDb();
    const [a] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!a || a.applicantId !== v.id) throw new ActionError("Application not found.");
    if (a.status !== "pending") throw new ActionError("Only pending applications can be withdrawn.");
    await db.update(applications).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(applications.id, a.id));
    revalidatePath("/collaborate");
    return ok(null, "Application withdrawn.");
  });
}

export async function reviewApplication(applicationId: string, decision: "accepted" | "rejected"): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("review", 60, 600);
    if (decision !== "accepted" && decision !== "rejected") throw new ActionError("Unknown decision.");
    const db = getDb();
    const [a] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!a) throw new ActionError("Application not found.");
    const access = await assertProject(a.projectId, v.id, "application.review", db);
    if (a.status !== "pending") throw new ActionError(`This application was already ${a.status}.`);
    if (a.applicantId === v.id) throw new ActionError("You can't review your own application.");
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, a.opportunityId)).limit(1);
    await db.batch([
      db.update(applications).set({ status: decision, reviewedBy: v.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(applications.id, a.id)),
      ...(decision === "accepted"
        ? [
            db
              .insert(projectMembers)
              .values({ projectId: a.projectId, userId: a.applicantId, role: "contributor" })
              .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: sql`CASE WHEN ${projectMembers.role} = 'viewer' THEN 'contributor' ELSE ${projectMembers.role} END` } }),
          ]
        : []),
    ]);
    await audit(db, { actorId: v.id, action: `application.${decision}`, entityType: "application", entityId: a.id, projectId: a.projectId });
    await notify(db, [
      {
        userId: a.applicantId,
        actorId: v.id,
        type: "application_decision",
        title: decision === "accepted" ? `You're in! Welcome to ${access.project.title}` : `Update on your application to ${access.project.title}`,
        body: decision === "accepted" ? `Your application for “${o?.title}” was accepted.` : `The team decided not to move forward with your application for “${o?.title}” this time.`,
        url: `/p/${access.project.slug}`,
        projectId: a.projectId,
      },
    ]);
    if (decision === "accepted") {
      await track(db, "collab.application_accepted", v.id, { projectId: a.projectId, applicantId: a.applicantId });
      const [who] = await db.select({ n: profiles.displayName }).from(profiles).where(eq(profiles.userId, a.applicantId)).limit(1);
      await recordActivity(db, { projectId: a.projectId, actorId: a.applicantId, kind: "joined", message: `${who?.n ?? "Someone"} joined the team to help with “${o?.title}” 👋`, url: `/p/${access.project.slug}/contributors` });
    }
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, decision === "accepted" ? "Accepted — they're now a contributor." : "Application declined.");
  });
}
