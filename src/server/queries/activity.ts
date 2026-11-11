import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, projectActivity } from "@/db/schema";
import type { ActivityItem } from "@/lib/realtime";

export async function recentActivity(projectId: string, limit = 20): Promise<ActivityItem[]> {
  const rows = await getDb()
    .select({ a: projectActivity, n: profiles.displayName, av: profiles.avatarKey })
    .from(projectActivity)
    .leftJoin(profiles, eq(profiles.userId, projectActivity.actorId))
    .where(eq(projectActivity.projectId, projectId))
    .orderBy(desc(projectActivity.createdAt))
    .limit(limit);
  return rows.map(({ a, n, av }) => ({ id: a.id, kind: a.kind, message: a.message, url: a.url, actorName: n, actorAvatar: av, createdAt: a.createdAt.getTime() }));
}
