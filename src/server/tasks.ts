"use server";
import { recordActivity } from "@/lib/activity";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { contributionVerifications, contributions, projectMembers, taskSubmissions, tasks } from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { submissionSchema, taskSchema } from "@/lib/validation";
import { newId } from "@/lib/ids";
import { assertProject } from "@/lib/authz";
import { notify } from "@/lib/notify";
import { track } from "@/lib/analytics";
import { audit } from "@/lib/audit";
import { CONTRIBUTION_TYPE_IDS, TASK_STATUSES } from "@/lib/constants";

async function assertMember(projectId: string, userId: string) {
  const db = getDb();
  const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
  if (!m || m.role === "viewer") throw new ActionError("Tasks can only be assigned to contributors of this project.");
}

export async function createTask(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("task", 40, 600);
    const input = taskSchema.parse(raw);
    const db = getDb();
    const access = await assertProject(input.projectId, v.id, "task.create", db);
    // Contributors may create tasks but only managers assign them to other people.
    if (input.assigneeId && input.assigneeId !== v.id && !access.can("task.manage")) throw new ActionError("Only admins can assign tasks to others.");
    if (input.assigneeId) await assertMember(input.projectId, input.assigneeId);
    const id = newId();
    const due = input.dueAt ? new Date(`${input.dueAt}T23:59:59Z`) : null;
    await db.insert(tasks).values({
      id,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      deliverable: input.deliverable,
      contributionType: input.contributionType,
      isCoding: input.isCoding,
      assigneeId: input.assigneeId ?? null,
      createdBy: v.id,
      dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
    });
    await recordActivity(db, { projectId: input.projectId, actorId: v.id, kind: "task_created", message: `${v.profile.displayName} added a to-do: “${input.title}”`, url: `/p/${access.project.slug}/tasks/${id}`, taskId: id });
    if (input.assigneeId && input.assigneeId !== v.id)
      await notify(db, [{ userId: input.assigneeId, actorId: v.id, type: "task_assigned", title: `New task in ${access.project.title}: ${input.title}`, url: `/p/${access.project.slug}/tasks/${id}`, projectId: input.projectId }]);
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok({ id }, "Task created.");
  });
}

export async function updateTask(raw: { taskId: string; status?: string; assigneeId?: string | null }): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("task", 60, 600);
    const db = getDb();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, raw.taskId)).limit(1);
    if (!t) throw new ActionError("Task not found.");
    const access = await assertProject(t.projectId, v.id, "task.work", db);
    const manager = access.can("task.manage");
    const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };

    if (raw.assigneeId !== undefined) {
      const selfClaim = raw.assigneeId === v.id && !t.assigneeId;
      const selfUnassign = raw.assigneeId === null && t.assigneeId === v.id;
      if (!manager && !selfClaim && !selfUnassign) throw new ActionError("Only admins can reassign tasks.");
      if (raw.assigneeId) await assertMember(t.projectId, raw.assigneeId);
      patch.assigneeId = raw.assigneeId;
      if (raw.assigneeId && raw.assigneeId !== v.id)
        await notify(db, [{ userId: raw.assigneeId, actorId: v.id, type: "task_assigned", title: `You were assigned “${t.title}”`, url: `/p/${access.project.slug}/tasks/${t.id}`, projectId: t.projectId }]);
    }
    if (raw.status !== undefined) {
      const status = z.enum(TASK_STATUSES).parse(raw.status);
      if (!manager && t.assigneeId !== v.id) throw new ActionError("Only the assignee or an admin can change this task's status.");
      // "done" is reached through review (approved submission) unless a manager closes it directly.
      if (status === "done" && !manager) throw new ActionError("Submit your work for review — an admin marks it done.");
      patch.status = status;
    }
    await db.update(tasks).set(patch).where(eq(tasks.id, t.id));
    const url = `/p/${access.project.slug}/tasks/${t.id}`;
    if (patch.assigneeId === v.id) await recordActivity(db, { projectId: t.projectId, actorId: v.id, kind: "task_claimed", message: `${v.profile.displayName} is taking “${t.title}”`, url, taskId: t.id });
    else if (patch.assigneeId === null && raw.assigneeId !== undefined) await recordActivity(db, { projectId: t.projectId, actorId: v.id, kind: "help", message: `“${t.title}” is open again — anyone can take it`, url, taskId: t.id });
    else if (patch.assigneeId) await recordActivity(db, { projectId: t.projectId, actorId: v.id, kind: "task_claimed", message: `${v.profile.displayName} asked someone to take “${t.title}”`, url, taskId: t.id });
    if (patch.status === "in_progress") await recordActivity(db, { projectId: t.projectId, actorId: v.id, kind: "task_started", message: `${v.profile.displayName} started working on “${t.title}”`, url, taskId: t.id });
    if (patch.status === "done") await recordActivity(db, { projectId: t.projectId, actorId: v.id, kind: "task_done", message: `“${t.title}” is done ✅`, url, taskId: t.id });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null);
  });
}

export async function submitTaskWork(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("submit", 20, 600);
    const input = submissionSchema.parse(raw);
    const db = getDb();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
    if (!t) throw new ActionError("Task not found.");
    const access = await assertProject(t.projectId, v.id, "task.work", db);
    if (t.assigneeId !== v.id) throw new ActionError("Claim this task before submitting work for it.");
    if (t.status === "done") throw new ActionError("This task is already done.");
    if (input.authorship !== "human" && !input.agentLabel) throw new ActionError("Tell reviewers which AI tool you used.");
    const id = newId();
    await db.batch([
      db.insert(taskSubmissions).values({
        id,
        taskId: t.id,
        submitterId: v.id,
        summary: input.summary,
        link: input.link || null,
        authorship: input.authorship,
        agentLabel: input.authorship === "human" ? null : (input.agentLabel ?? null),
      }),
      db.update(tasks).set({ status: "in_review", updatedAt: new Date() }).where(eq(tasks.id, t.id)),
    ]);
    const reviewers = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, t.projectId), inArray(projectMembers.role, ["owner", "admin"])));
    await recordActivity(db, { projectId: t.projectId, actorId: v.id, kind: "task_submitted", message: `${v.profile.displayName} finished a first version of “${t.title}” — ready for a look`, url: `/p/${access.project.slug}/tasks/${t.id}`, taskId: t.id });
    await notify(db, reviewers.map((r) => ({ userId: r.userId, actorId: v.id, type: "submission" as const, title: `${v.profile.displayName} submitted “${t.title}” for review`, url: `/p/${access.project.slug}/tasks/${t.id}`, projectId: t.projectId })));
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok({ id }, "Submitted for review.");
  });
}

/**
 * Approving a submission verifies it: the task is done and a verified contribution is recorded
 * on the contributor's profile, with an entry in the verification history.
 */
export async function reviewSubmission(submissionId: string, decision: "approve" | "changes", note = ""): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("review", 60, 600);
    const db = getDb();
    const [s] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);
    if (!s) throw new ActionError("Submission not found.");
    const [t] = await db.select().from(tasks).where(eq(tasks.id, s.taskId)).limit(1);
    if (!t) throw new ActionError("Task not found.");
    const access = await assertProject(t.projectId, v.id, "contribution.verify", db);
    if (s.status !== "submitted") throw new ActionError("This submission was already reviewed.");
    if (s.submitterId === v.id) throw new ActionError("Someone else needs to verify your own work.");
    const cleanNote = note.trim().slice(0, 1000) || null;
    const now = new Date();
    if (decision === "approve") {
      const cid = newId();
      await db.batch([
        db.update(taskSubmissions).set({ status: "approved", reviewedBy: v.id, reviewNote: cleanNote, reviewedAt: now }).where(eq(taskSubmissions.id, s.id)),
        db.update(tasks).set({ status: "done", updatedAt: now }).where(eq(tasks.id, t.id)),
        db.insert(contributions).values({
          id: cid,
          projectId: t.projectId,
          userId: s.submitterId,
          taskId: t.id,
          submissionId: s.id,
          type: t.contributionType,
          title: t.title,
          description: s.summary,
          authorship: s.authorship,
          agentLabel: s.agentLabel,
          status: "verified",
          verifiedBy: v.id,
          verifiedAt: now,
        }),
        db.insert(contributionVerifications).values({ id: newId(), contributionId: cid, actorId: v.id, action: "verified", note: cleanNote }),
      ]);
      await track(db, "collab.contribution_verified", v.id, { projectId: t.projectId, contributorId: s.submitterId, verifierId: v.id, authorship: s.authorship, type: t.contributionType });
      await recordActivity(db, { projectId: t.projectId, actorId: s.submitterId, kind: "task_done", message: `“${t.title}” is done ✅ — approved by ${v.profile.displayName}`, url: `/p/${access.project.slug}/tasks/${t.id}`, taskId: t.id });
      await notify(db, [{ userId: s.submitterId, actorId: v.id, type: "contribution_verified", title: `Your work on “${t.title}” was verified`, body: cleanNote ?? "", url: `/p/${access.project.slug}/contributors`, projectId: t.projectId }]);
    } else {
      if (!cleanNote) throw new ActionError("Add a note so they know what to change.");
      await db.batch([
        db.update(taskSubmissions).set({ status: "changes_requested", reviewedBy: v.id, reviewNote: cleanNote, reviewedAt: now }).where(eq(taskSubmissions.id, s.id)),
        db.update(tasks).set({ status: "in_progress", updatedAt: now }).where(eq(tasks.id, t.id)),
      ]);
      await recordActivity(db, { projectId: t.projectId, actorId: v.id, kind: "help", message: `${v.profile.displayName} left feedback on “${t.title}”`, url: `/p/${access.project.slug}/tasks/${t.id}`, taskId: t.id });
      await notify(db, [{ userId: s.submitterId, actorId: v.id, type: "submission_review", title: `Changes requested on “${t.title}”`, body: cleanNote, url: `/p/${access.project.slug}/tasks/${t.id}`, projectId: t.projectId }]);
    }
    await audit(db, { actorId: v.id, action: `submission.${decision}`, entityType: "task_submission", entityId: s.id, projectId: t.projectId });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, decision === "approve" ? "Verified — it's on their profile now." : "Changes requested.");
  });
}

const logSchema = z.object({
  projectId: z.string().uuid(),
  type: z.enum(CONTRIBUTION_TYPE_IDS),
  title: z.string().trim().min(4).max(140),
  description: z.string().trim().max(3000).default(""),
  authorship: z.enum(["human", "ai_assisted", "agent_generated"]),
  agentLabel: z.string().trim().max(60).optional(),
});

/** Members can log work that isn't a task (research, organizing…). It stays pending until a manager verifies it. */
export async function logContribution(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("contribution", 20, 600);
    const input = logSchema.parse(raw);
    const db = getDb();
    const access = await assertProject(input.projectId, v.id, "task.work", db);
    const id = newId();
    await db.insert(contributions).values({ id, projectId: input.projectId, userId: v.id, type: input.type, title: input.title, description: input.description, authorship: input.authorship, agentLabel: input.authorship === "human" ? null : (input.agentLabel ?? null) });
    await db.insert(contributionVerifications).values({ id: newId(), contributionId: id, actorId: v.id, action: "submitted" });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok({ id }, "Logged — a project admin will verify it.");
  });
}

export async function verifyContribution(contributionId: string, decision: "verified" | "rejected", note = ""): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("review", 60, 600);
    const db = getDb();
    const [c] = await db.select().from(contributions).where(eq(contributions.id, contributionId)).limit(1);
    if (!c) throw new ActionError("Contribution not found.");
    const access = await assertProject(c.projectId, v.id, "contribution.verify", db);
    if (c.userId === v.id) throw new ActionError("Someone else needs to verify your own work.");
    if (c.status !== "pending") throw new ActionError(`Already ${c.status}.`);
    const now = new Date();
    await db.batch([
      db.update(contributions).set({ status: decision, verifiedBy: v.id, verifiedAt: now }).where(eq(contributions.id, c.id)),
      db.insert(contributionVerifications).values({ id: newId(), contributionId: c.id, actorId: v.id, action: decision, note: note.trim().slice(0, 1000) || null }),
    ]);
    if (decision === "verified") {
      await track(db, "collab.contribution_verified", v.id, { projectId: c.projectId, contributorId: c.userId, verifierId: v.id, authorship: c.authorship, type: c.type });
      await notify(db, [{ userId: c.userId, actorId: v.id, type: "contribution_verified", title: `Your contribution “${c.title}” was verified`, url: `/p/${access.project.slug}/contributors`, projectId: c.projectId }]);
    }
    await audit(db, { actorId: v.id, action: `contribution.${decision}`, entityType: "contribution", entityId: c.id, projectId: c.projectId });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, decision === "verified" ? "Verified." : "Marked as not verified.");
  });
}
