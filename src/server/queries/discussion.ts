import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { canSeeDiscussion } from "@/server/guards";
import { discussions } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CommentRow = {
  id: string;
  parentId: string | null;
  body: string;
  status: string;
  createdAt: number;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
};

export async function getDiscussion(id: string, viewerId: string | null) {
  const db = getDb();
  const [d] = await db.select().from(discussions).where(eq(discussions.id, id)).limit(1);
  if (!d || d.status !== "published") return null;
  if (!(await canSeeDiscussion(db, d, viewerId))) return null;
  const v = viewerId ?? "";
  const [meta] = await db.all<{
    username: string; displayName: string; avatarKey: string | null; bio: string; suspendedAt: number | null;
    projectSlug: string | null; projectTitle: string | null; convertedSlug: string | null; convertedTitle: string | null; convertedStatus: string | null;
    myReactions: string | null; bookmarked: number; blocked: number; myVote: number | null; helpers: number;
  }>(sql`
    SELECT p.username, p.display_name AS displayName, p.avatar_key AS avatarKey, p.bio, p.suspended_at AS suspendedAt,
      pj.slug AS projectSlug, pj.title AS projectTitle, cp.slug AS convertedSlug, cp.title AS convertedTitle, cp.status AS convertedStatus,
      (SELECT group_concat(kind) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = ${id} AND r.user_id = ${v}) AS myReactions,
      EXISTS (SELECT 1 FROM bookmarks WHERE discussion_id = ${id} AND user_id = ${v}) AS bookmarked,
      (SELECT value FROM votes WHERE discussion_id = ${id} AND user_id = ${v}) AS myVote,
      (SELECT count(*) FROM reactions WHERE target_type = 'discussion' AND target_id = ${id} AND kind = 'helping') AS helpers,
      EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${v} AND b.blocked_id = ${d.authorId}) OR (b.blocker_id = ${d.authorId} AND b.blocked_id = ${v})) AS blocked
    FROM profiles p
    LEFT JOIN projects pj ON pj.id = ${d.projectId}
    LEFT JOIN projects cp ON cp.id = ${d.convertedProjectId} AND (cp.visibility = 'public' OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = cp.id AND m.user_id = ${v}))
    WHERE p.user_id = ${d.authorId}`);
  if (!meta || meta.suspendedAt || meta.blocked) return null;
  const reactionCounts = await db.all<{ kind: string; n: number }>(
    sql`SELECT kind, count(*) AS n FROM reactions WHERE target_type = 'discussion' AND target_id = ${id} GROUP BY kind`,
  );
  const comments = await db.all<CommentRow>(sql`
    SELECT c.id, c.parent_id AS parentId, c.body, c.status, c.created_at AS createdAt, c.author_id AS authorId,
      p.username, p.display_name AS displayName, p.avatar_key AS avatarKey
    FROM comments c JOIN profiles p ON p.user_id = c.author_id
    WHERE c.discussion_id = ${id}
      AND (c.status = 'published' OR EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id AND r.status = 'published'))
      AND p.suspended_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${v} AND b.blocked_id = c.author_id) OR (b.blocker_id = c.author_id AND b.blocked_id = ${v}))
    ORDER BY c.created_at ASC LIMIT 500`);
  return { d, meta, reactionCounts, comments };
}

export async function discussionParticipantCount(id: string) {
  const [row] = await getDb().all<{ n: number }>(sql`
    SELECT count(*) AS n FROM (
      SELECT author_id AS u FROM comments WHERE discussion_id = ${id} AND status = 'published'
      UNION SELECT user_id AS u FROM reactions WHERE target_type = 'discussion' AND target_id = ${id}
    ) x WHERE u != (SELECT author_id FROM discussions WHERE id = ${id})`);
  return row?.n ?? 0;
}
