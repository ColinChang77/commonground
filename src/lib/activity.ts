import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { profiles, projectActivity } from "@/db/schema";
import { newId } from "@/lib/ids";
import { publish } from "@/lib/realtime";

export type ActivityKind = "joined" | "task_claimed" | "task_started" | "task_submitted" | "task_done" | "task_created" | "update" | "comment" | "agent" | "github" | "build" | "milestone" | "help";

/** Records a human-readable project event and pushes it live to everyone viewing the project. */
export async function recordActivity(db: DB, a: { projectId: string; actorId: string | null; kind: ActivityKind; message: string; url?: string | null; taskId?: string | null }) {
  const id = newId();
  const createdAt = new Date();
  await db.insert(projectActivity).values({ id, projectId: a.projectId, actorId: a.actorId, kind: a.kind, message: a.message.slice(0, 280), url: a.url ?? null, taskId: a.taskId ?? null, createdAt });
  let actorName: string | null = null;
  let actorAvatar: string | null = null;
  if (a.actorId) {
    const [p] = await db.select({ n: profiles.displayName, av: profiles.avatarKey }).from(profiles).where(eq(profiles.userId, a.actorId)).limit(1);
    actorName = p?.n ?? null;
    actorAvatar = p?.av ?? null;
  }
  await publish(`p:${a.projectId}`, { kind: "activity", item: { id, kind: a.kind, message: a.message, url: a.url ?? null, actorName, actorAvatar, createdAt: createdAt.getTime() } });
}
