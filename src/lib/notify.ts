import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { blocks, notifications } from "@/db/schema";
import { newId } from "@/lib/ids";

export type NotificationType =
  | "comment"
  | "reply"
  | "mention"
  | "application"
  | "application_decision"
  | "invitation"
  | "task_assigned"
  | "submission"
  | "submission_review"
  | "contribution_verified"
  | "project_update"
  | "project_created"
  | "agent_result"
  | "approval_request"
  | "pull_request"
  | "member_removed";

export type NotificationInput = {
  userId: string;
  actorId: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  url: string;
  projectId?: string | null;
};

/** Persists notifications; skips self-notifications and recipients who blocked the actor. */
export async function notify(db: DB, items: NotificationInput[]) {
  const unique = new Map<string, NotificationInput>();
  for (const n of items) if (n.userId !== n.actorId && !unique.has(`${n.userId}:${n.type}`)) unique.set(`${n.userId}:${n.type}`, n);
  let list = [...unique.values()];
  if (!list.length) return;
  const actorIds = [...new Set(list.map((n) => n.actorId).filter(Boolean))] as string[];
  if (actorIds.length) {
    const blocked = await db
      .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
      .from(blocks)
      .where(and(inArray(blocks.blockedId, actorIds), inArray(blocks.blockerId, list.map((n) => n.userId))));
    const set = new Set(blocked.map((b) => `${b.blockerId}:${b.blockedId}`));
    list = list.filter((n) => !n.actorId || !set.has(`${n.userId}:${n.actorId}`));
  }
  if (!list.length) return;
  await db.insert(notifications).values(
    list.map((n) => ({
      id: newId(),
      userId: n.userId,
      actorId: n.actorId,
      type: n.type,
      title: n.title.slice(0, 200),
      body: (n.body ?? "").slice(0, 400),
      url: n.url,
      projectId: n.projectId ?? null,
    })),
  );
}

/** Extracts @username mentions from markdown text. */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|[^\w@])@([a-zA-Z0-9_]{3,30})\b/g)) out.add(m[2].toLowerCase());
  return [...out].slice(0, 10);
}

export async function unreadCount(db: DB, userId: string) {
  const { sql } = await import("drizzle-orm");
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
  return row?.n ?? 0;
}
