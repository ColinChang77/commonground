import "server-only";
import { cache } from "react";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, projectMembers, projectRepositories } from "@/db/schema";
import { getProjectAccess } from "@/lib/authz";
import { getViewer } from "@/lib/session";

export type MemberRow = { userId: string; role: string; joinedAt: Date; username: string; displayName: string; avatarKey: string | null };

/** Loads a project for the current viewer; returns null when it doesn't exist or isn't visible to them. */
export const loadProject = cache(async (slug: string) => {
  const viewer = await getViewer();
  const db = getDb();
  const access = await getProjectAccess({ slug }, viewer?.id ?? null, db);
  if (!access || !access.can("project.view")) return null;
  const members = (await db
    .select({ userId: projectMembers.userId, role: projectMembers.role, joinedAt: projectMembers.joinedAt, username: profiles.username, displayName: profiles.displayName, avatarKey: profiles.avatarKey })
    .from(projectMembers)
    .innerJoin(profiles, eq(profiles.userId, projectMembers.userId))
    .where(eq(projectMembers.projectId, access.project.id))
    .orderBy(sql`CASE ${projectMembers.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'contributor' THEN 2 ELSE 3 END`, projectMembers.joinedAt)) as MemberRow[];
  const owner = members.find((m) => m.role === "owner");
  const [repo] = await db.select().from(projectRepositories).where(eq(projectRepositories.projectId, access.project.id)).limit(1);
  const [counts] = await db.all<{ openRoles: number; openTasks: number; pendingApps: number; pendingApprovals: number; pendingContribs: number; buildReviews: number }>(sql`
    SELECT
      (SELECT count(*) FROM opportunities WHERE project_id = ${access.project.id} AND status = 'open') AS openRoles,
      (SELECT count(*) FROM tasks WHERE project_id = ${access.project.id} AND status != 'done') AS openTasks,
      (SELECT count(*) FROM applications WHERE project_id = ${access.project.id} AND status = 'pending') AS pendingApps,
      (SELECT count(*) FROM agent_approvals WHERE project_id = ${access.project.id} AND status = 'pending') AS pendingApprovals,
      (SELECT count(*) FROM contributions WHERE project_id = ${access.project.id} AND status = 'pending') AS pendingContribs,
      (SELECT count(*) FROM build_requests WHERE project_id = ${access.project.id} AND builder = 'team' AND status = 'review') AS buildReviews`);
  return { viewer, access, project: access.project, role: access.role, members, owner, repo: repo ?? null, counts };
});

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export { and, desc, eq };
