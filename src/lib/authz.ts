import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { projectMembers, projects } from "@/db/schema";
import type { ProjectRole } from "@/lib/constants";
import { can, type ProjectAction, type Visibility } from "@/lib/permissions";
import { ActionError } from "@/lib/action";

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectAccess = {
  project: ProjectRow;
  role: ProjectRole | null;
  can: (action: ProjectAction) => boolean;
};

export async function getProjectAccess(
  projectIdOrSlug: { id?: string; slug?: string },
  userId: string | null,
  db: DB = getDb(),
): Promise<ProjectAccess | null> {
  const where = projectIdOrSlug.id ? eq(projects.id, projectIdOrSlug.id) : eq(projects.slug, projectIdOrSlug.slug ?? "");
  const [project] = await db.select().from(projects).where(where).limit(1);
  if (!project) return null;
  let role: ProjectRole | null = null;
  if (userId) {
    const [m] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
      .limit(1);
    role = (m?.role as ProjectRole) ?? null;
  }
  const vis = project.visibility as Visibility;
  return { project, role, can: (a) => can(role, a, vis) };
}

/** Loads the project and throws unless `userId` may perform `action`. Private projects look "not found" to outsiders. */
export async function assertProject(projectId: string, userId: string, action: ProjectAction, db: DB = getDb()) {
  const access = await getProjectAccess({ id: projectId }, userId, db);
  if (!access || !access.can("project.view")) throw new ActionError("Project not found.");
  if (!access.can(action)) throw new ActionError("You don't have permission to do that in this project.");
  if (access.project.status === "archived" && action !== "project.view" && action !== "project.edit") {
    throw new ActionError("This project is archived. Un-archive it to make changes.");
  }
  return access;
}
