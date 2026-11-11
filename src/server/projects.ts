"use server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import {
  comments, discussions, opportunities, opportunitySkills, profiles, projectInvitations, projectMembers, projectUpdates, projects, reactions, tasks,
} from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { projectSchema, projectSettingsSchema, updateSchema } from "@/lib/validation";
import { newId, shortSuffix, slugify } from "@/lib/ids";
import { assertProject, getProjectAccess } from "@/lib/authz";
import { recordActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { track } from "@/lib/analytics";
import { audit } from "@/lib/audit";
import { ensureSkills } from "@/server/skills";
import { canAssignRole } from "@/lib/permissions";
import type { ProjectRole } from "@/lib/constants";
import { z } from "zod";

async function uniqueSlug(title: string) {
  const db = getDb();
  const base = slugify(title);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${shortSuffix()}`;
    const [hit] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1);
    if (!hit) return slug;
  }
  return `${base}-${newId().slice(0, 8)}`;
}

/** Creates a project — from scratch, or (signature flow) by converting a discussion the caller owns. */
export async function createProject(raw: unknown): Promise<ActionResult<{ slug: string }>> {
  return run(async () => {
    const v = await activeViewer("project-create", 5, 3600);
    const input = projectSchema.parse(raw);
    const db = getDb();
    let source: typeof discussions.$inferSelect | null = null;
    if (input.sourceDiscussionId) {
      [source] = await db.select().from(discussions).where(eq(discussions.id, input.sourceDiscussionId)).limit(1);
      if (!source || source.status !== "published") throw new ActionError("That discussion no longer exists.");
      if (source.authorId !== v.id) throw new ActionError("Only the author can turn a discussion into a project.");
      if (source.convertedProjectId) throw new ActionError("This discussion is already a project.");
      if (source.projectId) throw new ActionError("Discussions inside a project can't become separate projects.");
    }
    const id = newId();
    const slug = await uniqueSlug(input.title);
    const status = input.neededRoles.length ? "recruiting" : "exploring";
    await db.batch([
      db.insert(projects).values({
        id,
        slug,
        ownerId: v.id,
        title: input.title,
        summary: input.summary,
        description: input.description,
        goals: JSON.stringify(input.goals),
        outcomes: input.outcomes,
        category: input.category,
        status,
        visibility: input.visibility,
        isSoftware: input.isSoftware,
        tags: JSON.stringify(input.tags),
        sourceDiscussionId: source?.id ?? null,
      }),
      db.insert(projectMembers).values({ projectId: id, userId: v.id, role: "owner" }),
      ...(source
        ? [db.update(discussions).set({ convertedProjectId: id, lastActivityAt: new Date() }).where(eq(discussions.id, source.id))]
        : []),
    ]);
    for (const role of input.neededRoles) {
      const oppId = newId();
      await db.insert(opportunities).values({ id: oppId, projectId: id, createdBy: v.id, title: role.title, description: `We're looking for help with: ${role.title}.`, compensation: "volunteer" });
      const skillIds = await ensureSkills(db, role.skills);
      if (skillIds.length) await db.insert(opportunitySkills).values(skillIds.map((skillId) => ({ opportunityId: oppId, skillId })));
    }
    await audit(db, { actorId: v.id, action: source ? "project.create_from_discussion" : "project.create", entityType: "project", entityId: id, projectId: id });
    await recordActivity(db, { projectId: id, actorId: v.id, kind: "milestone", message: source ? `${v.profile.displayName} turned the conversation “${source.title}” into this project 🎉` : `${v.profile.displayName} started this project 🎉`, url: source ? `/d/${source.id}` : null });

    if (source) {
      // Everyone who took part in the discussion hears that it became a project.
      const participants = await db.all<{ userId: string }>(sql`
        SELECT DISTINCT author_id AS userId FROM ${comments} WHERE discussion_id = ${source.id} AND status = 'published'
        UNION SELECT DISTINCT user_id AS userId FROM ${reactions} WHERE target_type = 'discussion' AND target_id = ${source.id}`);
      if (input.visibility === "public")
        await notify(
          db,
          participants.map((p) => ({
            userId: p.userId,
            actorId: v.id,
            type: "project_created" as const,
            title: `“${source!.title}” is now a project`,
            body: `${v.profile.displayName} turned the discussion you joined into a project${input.neededRoles.length ? " and is looking for collaborators" : ""}.`,
            url: `/p/${slug}`,
            projectId: id,
          })),
        );
      await track(db, "project.created_from_discussion", v.id, { projectId: id, participants: participants.length });
    } else await track(db, "project.created", v.id, { projectId: id });
    revalidatePath("/");
    return ok({ slug }, "Project created.");
  });
}

export async function updateProject(raw: unknown): Promise<ActionResult<{ slug: string }>> {
  return run(async () => {
    const v = await activeViewer("project-edit", 30, 600);
    const input = projectSettingsSchema.parse(raw);
    const db = getDb();
    const access = await assertProject(input.projectId, v.id, "project.edit", db);
    const wasCompleted = access.project.status === "completed";
    await db
      .update(projects)
      .set({
        title: input.title,
        summary: input.summary,
        description: input.description,
        goals: JSON.stringify(input.goals),
        outcomes: input.outcomes,
        category: input.category,
        status: input.status,
        visibility: input.visibility,
        isSoftware: input.isSoftware,
        openJoin: input.openJoin,
        tags: JSON.stringify(input.tags),
        links: JSON.stringify(input.links),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.projectId));
    await audit(db, { actorId: v.id, action: "project.update", entityType: "project", entityId: input.projectId, projectId: input.projectId, metadata: { status: input.status, visibility: input.visibility } });
    if (input.status === "completed" && !wasCompleted) await track(db, "collab.project_completed", v.id, { projectId: input.projectId });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok({ slug: access.project.slug }, "Project saved.");
  });
}

export async function deleteProject(projectId: string, confirmTitle: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("project-delete", 5, 600);
    const db = getDb();
    const access = await assertProject(projectId, v.id, "project.delete", db);
    if (confirmTitle.trim() !== access.project.title) throw new ActionError("Type the project title exactly to confirm.");
    if (access.project.sourceDiscussionId)
      await db.update(discussions).set({ convertedProjectId: null }).where(eq(discussions.id, access.project.sourceDiscussionId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await audit(db, { actorId: v.id, action: "project.delete", entityType: "project", entityId: projectId, metadata: { title: access.project.title } });
    revalidatePath("/");
    return ok(null, "Project deleted.");
  });
}

const roleSchema = z.enum(["admin", "contributor", "viewer"]);

export async function changeMemberRole(projectId: string, userId: string, role: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("members", 30, 300);
    const target = roleSchema.parse(role) as ProjectRole;
    const db = getDb();
    const access = await assertProject(projectId, v.id, "members.manage", db);
    const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
    if (!m) throw new ActionError("That person isn't a member.");
    if (userId === v.id) throw new ActionError("You can't change your own role.");
    if (!canAssignRole(access.role, target, m.role as ProjectRole)) throw new ActionError("You don't have permission to assign that role.");
    await db.update(projectMembers).set({ role: target }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await audit(db, { actorId: v.id, action: "member.role_change", entityType: "member", entityId: userId, projectId, metadata: { from: m.role, to: target } });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, "Role updated.");
  });
}

export async function removeMember(projectId: string, userId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("members", 30, 300);
    const db = getDb();
    const self = userId === v.id;
    const access = await assertProject(projectId, v.id, self ? "project.view" : "members.manage", db);
    const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
    if (!m) throw new ActionError("That person isn't a member.");
    if (m.role === "owner") throw new ActionError(self ? "Owners can't leave — transfer ownership first." : "The owner can't be removed.");
    if (!self && m.role === "admin" && access.role !== "owner") throw new ActionError("Only the owner can remove admins.");
    await db.batch([
      db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))),
      db.update(tasks).set({ assigneeId: null, status: "todo" }).where(and(eq(tasks.projectId, projectId), eq(tasks.assigneeId, userId), ne(tasks.status, "done"))),
    ]);
    await audit(db, { actorId: v.id, action: self ? "member.leave" : "member.remove", entityType: "member", entityId: userId, projectId });
    if (!self)
      await notify(db, [{ userId, actorId: v.id, type: "member_removed", title: `You were removed from ${access.project.title}`, url: `/p/${access.project.slug}`, projectId }]);
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, self ? "You left the project." : "Member removed.");
  });
}

export async function transferOwnership(projectId: string, newOwnerId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("members", 10, 600);
    const db = getDb();
    const access = await assertProject(projectId, v.id, "project.transfer", db);
    const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, newOwnerId))).limit(1);
    if (!m || newOwnerId === v.id) throw new ActionError("Choose another member of this project.");
    await db.batch([
      db.update(projects).set({ ownerId: newOwnerId, updatedAt: new Date() }).where(eq(projects.id, projectId)),
      db.update(projectMembers).set({ role: "owner" }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, newOwnerId))),
      db.update(projectMembers).set({ role: "admin" }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, v.id))),
    ]);
    await audit(db, { actorId: v.id, action: "project.transfer", entityType: "project", entityId: projectId, projectId, metadata: { to: newOwnerId } });
    await notify(db, [{ userId: newOwnerId, actorId: v.id, type: "invitation", title: `You're now the owner of ${access.project.title}`, url: `/p/${access.project.slug}`, projectId }]);
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, "Ownership transferred.");
  });
}

export async function inviteMember(projectId: string, username: string, role: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("invite", 20, 600);
    const target = roleSchema.parse(role) as ProjectRole;
    const db = getDb();
    const access = await assertProject(projectId, v.id, "members.manage", db);
    if (!canAssignRole(access.role, target, null)) throw new ActionError("You can't invite people with that role.");
    const [p] = await db.select().from(profiles).where(sql`lower(${profiles.username}) = ${username.trim().replace(/^@/, "").toLowerCase()}`).limit(1);
    if (!p) throw new ActionError("No one with that username.");
    const [existing] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, p.userId))).limit(1);
    if (existing) throw new ActionError("They're already a member.");
    const [pending] = await db
      .select()
      .from(projectInvitations)
      .where(and(eq(projectInvitations.projectId, projectId), eq(projectInvitations.inviteeId, p.userId), eq(projectInvitations.status, "pending")))
      .limit(1);
    if (pending) throw new ActionError("They already have a pending invitation.");
    await db.insert(projectInvitations).values({ id: newId(), projectId, inviteeId: p.userId, invitedBy: v.id, role: target });
    await notify(db, [{ userId: p.userId, actorId: v.id, type: "invitation", title: `${v.profile.displayName} invited you to join ${access.project.title}`, url: `/activity?tab=invitations`, projectId }]);
    return ok(null, `Invitation sent to @${p.username}.`);
  });
}

export async function respondToInvitation(invitationId: string, accept: boolean): Promise<ActionResult<{ slug: string | null }>> {
  return run(async () => {
    const v = await activeViewer("invite-respond", 30, 600);
    const db = getDb();
    const [inv] = await db.select().from(projectInvitations).where(eq(projectInvitations.id, invitationId)).limit(1);
    if (!inv || inv.inviteeId !== v.id || inv.status !== "pending") throw new ActionError("This invitation is no longer available.");
    const [proj] = await db.select().from(projects).where(eq(projects.id, inv.projectId)).limit(1);
    if (!proj) throw new ActionError("This project no longer exists.");
    await db.batch([
      db.update(projectInvitations).set({ status: accept ? "accepted" : "declined" }).where(eq(projectInvitations.id, inv.id)),
      ...(accept ? [db.insert(projectMembers).values({ projectId: inv.projectId, userId: v.id, role: inv.role }).onConflictDoNothing()] : []),
    ]);
    if (accept) await recordActivity(db, { projectId: proj.id, actorId: v.id, kind: "joined", message: `${v.profile.displayName} joined the team 👋`, url: `/p/${proj.slug}/contributors` });
    if (accept) await notify(db, [{ userId: inv.invitedBy, actorId: v.id, type: "invitation", title: `${v.profile.displayName} joined ${proj.title}`, url: `/p/${proj.slug}/contributors`, projectId: proj.id }]);
    revalidatePath("/activity");
    return ok({ slug: accept ? proj.slug : null }, accept ? `Welcome to ${proj.title}!` : "Invitation declined.");
  });
}

export async function postProjectUpdate(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("update", 10, 600);
    const input = updateSchema.parse(raw);
    const db = getDb();
    const access = await assertProject(input.projectId, v.id, "update.post", db);
    const id = newId();
    await db.insert(projectUpdates).values({ id, projectId: input.projectId, authorId: v.id, title: input.title, body: input.body, isMilestone: input.isMilestone });
    if (input.shareToFeed && access.project.visibility === "public") {
      await db.insert(discussions).values({ id: newId(), authorId: v.id, kind: "update", title: input.title, body: input.body, category: access.project.category, projectId: input.projectId });
    }
    await recordActivity(db, { projectId: input.projectId, actorId: v.id, kind: input.isMilestone ? "milestone" : "update", message: `${v.profile.displayName} shared news: “${input.title}”`, url: `/p/${access.project.slug}/updates` });
    const members = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, input.projectId));
    await notify(db, members.map((m) => ({ userId: m.userId, actorId: v.id, type: "project_update" as const, title: `${access.project.title}: ${input.title}`, url: `/p/${access.project.slug}/updates`, projectId: input.projectId })));
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, input.projectId));
    revalidatePath(`/p/${access.project.slug}`, "layout");
    revalidatePath("/");
    return ok({ id }, "Update published.");
  });
}

/** One-click join for open public projects (no application). Closed/private teams use applications instead. */
export async function joinProject(projectId: string): Promise<ActionResult<{ slug: string }>> {
  return run(async () => {
    const v = await activeViewer("join", 20, 600);
    const db = getDb();
    const access = await getProjectAccess({ id: projectId }, v.id, db);
    if (!access?.can("project.view")) throw new ActionError("Project not found.");
    const p = access.project;
    if (access.role && access.role !== "viewer") return ok({ slug: p.slug }, "You're already on the team.");
    if (p.visibility !== "public" || !p.openJoin || p.status === "archived" || p.status === "completed")
      throw new ActionError("This team reviews new members — apply to one of the ways to help instead.");
    await db.insert(projectMembers).values({ projectId, userId: v.id, role: "contributor" }).onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: "contributor" } });
    await recordActivity(db, { projectId, actorId: v.id, kind: "joined", message: `${v.profile.displayName} joined the team 👋`, url: `/u/${v.profile.username}` });
    await notify(db, [{ userId: p.ownerId, actorId: v.id, type: "invitation", title: `${v.profile.displayName} joined ${p.title}`, url: `/p/${p.slug}/contributors`, projectId }]);
    await track(db, "collab.application_accepted", v.id, { projectId, via: "open_join" });
    revalidatePath(`/p/${p.slug}`, "layout");
    return ok({ slug: p.slug }, `Welcome to ${p.title}! 🎉`);
  });
}

/** "I'll do this": joins (if the project is open) and claims an unassigned to-do in one step. */
export async function takeTask(taskId: string): Promise<ActionResult<{ slug: string }>> {
  return run(async () => {
    const v = await activeViewer("take-task", 30, 600);
    const db = getDb();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!t) throw new ActionError("To-do not found.");
    const access = await getProjectAccess({ id: t.projectId }, v.id, db);
    if (!access?.can("project.view")) throw new ActionError("To-do not found.");
    const p = access.project;
    if (t.assigneeId && t.assigneeId !== v.id) throw new ActionError("Someone already took this one.");
    if (t.status === "done") throw new ActionError("This one is already done.");
    if (!access.role || access.role === "viewer") {
      if (p.visibility !== "public" || !p.openJoin || p.status === "archived") throw new ActionError("Join the team first — apply under Ways to help.");
      await db.insert(projectMembers).values({ projectId: p.id, userId: v.id, role: "contributor" }).onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: "contributor" } });
      await recordActivity(db, { projectId: p.id, actorId: v.id, kind: "joined", message: `${v.profile.displayName} joined the team 👋`, url: `/u/${v.profile.username}` });
    }
    // Conditional update so two people clicking at once can't both get it.
    const claimed = await db.update(tasks).set({ assigneeId: v.id, status: "in_progress", updatedAt: new Date() }).where(and(eq(tasks.id, t.id), sql`${tasks.assigneeId} IS NULL OR ${tasks.assigneeId} = ${v.id}`)).returning({ id: tasks.id });
    if (!claimed.length) throw new ActionError("Someone just took this one.");
    await recordActivity(db, { projectId: p.id, actorId: v.id, kind: "task_claimed", message: `${v.profile.displayName} is working on “${t.title}”`, url: `/p/${p.slug}/tasks/${t.id}`, taskId: t.id });
    if (t.createdBy !== v.id) await notify(db, [{ userId: t.createdBy, actorId: v.id, type: "task_assigned", title: `${v.profile.displayName} picked up “${t.title}”`, url: `/p/${p.slug}/tasks/${t.id}`, projectId: p.id }]);
    revalidatePath(`/p/${p.slug}`, "layout");
    return ok({ slug: p.slug }, "It's yours — thanks for helping!");
  });
}
