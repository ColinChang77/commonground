import type { DB } from "@/db";
import { account, profiles, projectMembers, projects, tasks, user } from "@/db/schema";
import { newId } from "@/lib/ids";

export async function mkUser(db: DB, username: string, opts: { githubId?: string } = {}) {
  const id = newId();
  const now = new Date();
  await db.insert(user).values({ id, name: username, email: `${username}@example.test`, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(profiles).values({ userId: id, username, displayName: username, onboardedAt: now });
  if (opts.githubId) await db.insert(account).values({ id: newId(), accountId: opts.githubId, providerId: "github", userId: id, createdAt: now, updatedAt: now });
  return id;
}

export async function mkProject(db: DB, ownerId: string, title: string, visibility: "public" | "private" = "public") {
  const id = newId();
  await db.insert(projects).values({ id, slug: `${title.toLowerCase().replace(/\W+/g, "-")}-${id.slice(0, 4)}`, ownerId, title, summary: `${title} summary text`, category: "technology", visibility, isSoftware: true, goals: JSON.stringify(["Ship it"]) });
  await db.insert(projectMembers).values({ projectId: id, userId: ownerId, role: "owner" });
  return id;
}

export async function addMember(db: DB, projectId: string, userId: string, role: "admin" | "contributor" | "viewer") {
  await db.insert(projectMembers).values({ projectId, userId, role });
}

export async function mkTask(db: DB, projectId: string, createdBy: string, title: string, assigneeId: string | null = null) {
  const id = newId();
  await db.insert(tasks).values({ id, projectId, title, createdBy, assigneeId, isCoding: true });
  return id;
}
