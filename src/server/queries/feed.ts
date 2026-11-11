import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { CATEGORY_IDS } from "@/lib/constants";

export type FeedTab = "home" | "hot" | "new" | "top" | "following" | "projects" | "discussions" | "for-you" | "latest" | "trending";
/** Primary sort tabs (Reddit-style). Legacy ids map onto these. */
export const SORT_TABS: { id: "hot" | "new" | "top"; label: string; emoji: string }[] = [
  { id: "hot", label: "Hot", emoji: "🔥" },
  { id: "new", label: "New", emoji: "✨" },
  { id: "top", label: "Top", emoji: "🏆" },
];
export const TOP_PERIODS = [
  { id: "day", label: "Today", ms: 86400000 },
  { id: "week", label: "This week", ms: 7 * 86400000 },
  { id: "month", label: "This month", ms: 30 * 86400000 },
  { id: "all", label: "All time", ms: 0 },
] as const;
export const FEED_TABS = SORT_TABS;

export type FeedPost = {
  id: string;
  kind: "discussion" | "idea" | "update";
  title: string;
  body: string;
  category: string;
  imageKey: string | null;
  commentCount: number;
  reactionCount: number;
  score: number;
  myVote: number | null;
  helpers: number;
  convertedStatus?: string | null;
  participants?: number;
  participantNames?: string | null;
  authorIsDemo?: number;
  createdAt: number;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  projectSlug: string | null;
  projectTitle: string | null;
  convertedSlug: string | null;
  convertedTitle: string | null;
  myReactions: string | null;
  bookmarked: number;
  showcaseRepo?: string | null;
};

export type FeedProject = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  isSoftware: number;
  updatedAt: number;
  ownerName: string;
  ownerUsername: string;
  ownerAvatar: string | null;
  memberCount: number;
  openRoles: number;
};

export const PAGE_SIZE = 20;

/** Excludes content from suspended users and anyone the viewer blocked / was blocked by. */
function visibilityFilter(viewerId: string | null): SQL {
  const base = sql`d.status = 'published' AND p.suspended_at IS NULL
    AND (d.project_id IS NULL OR (d.kind = 'update' AND EXISTS (SELECT 1 FROM projects px WHERE px.id = d.project_id AND px.visibility = 'public')))`;
  if (!viewerId) return base;
  return sql`${base} AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = d.author_id) OR (b.blocker_id = d.author_id AND b.blocked_id = ${viewerId}))`;
}

export async function getFeed(opts: { tab: FeedTab; viewerId: string | null; category?: string; page: number; period?: string }) {
  const db = getDb();
  const viewer = opts.viewerId ?? "";
  const offset = Math.max(0, opts.page) * PAGE_SIZE;
  const category = opts.category && (CATEGORY_IDS as readonly string[]).includes(opts.category) ? opts.category : null;

  if (opts.tab === "projects") {
    const rows = await db.all<FeedProject>(sql`
      SELECT pr.id, pr.slug, pr.title, pr.summary, pr.category, pr.status, pr.is_software AS isSoftware, pr.updated_at AS updatedAt,
             p.display_name AS ownerName, p.username AS ownerUsername, p.avatar_key AS ownerAvatar,
             (SELECT count(*) FROM project_members m WHERE m.project_id = pr.id) AS memberCount,
             (SELECT count(*) FROM opportunities o WHERE o.project_id = pr.id AND o.status = 'open') AS openRoles
      FROM projects pr JOIN profiles p ON p.user_id = pr.owner_id
      WHERE pr.visibility = 'public' AND pr.status != 'archived' AND p.suspended_at IS NULL
        ${category ? sql`AND pr.category = ${category}` : sql``}
      ORDER BY pr.updated_at DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`);
    return { kind: "projects" as const, items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  }

  let where = visibilityFilter(opts.viewerId);
  if (category) where = sql`${where} AND d.category = ${category}`;
  let order = sql`d.created_at DESC`;

  const hours = sql`((unixepoch() * 1000 - d.created_at) / 3600000.0 + 2)`;
  const hot = sql`((MAX(d.score, 0) * 2 + d.comment_count * 3 + 1) * 1.0) / (${hours} * ${hours}) DESC, d.created_at DESC`;
  switch (opts.tab) {
    case "following":
      where = sql`${where} AND d.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ${viewer})`;
      break;
    case "discussions":
      where = sql`${where} AND d.kind IN ('discussion','idea')`;
      break;
    case "new":
    case "latest":
      break;
    case "top": {
      const p = TOP_PERIODS.find((x) => x.id === opts.period) ?? TOP_PERIODS[1];
      if (p.ms) where = sql`${where} AND d.created_at > (unixepoch() * 1000 - ${p.ms})`;
      order = sql`d.score DESC, d.comment_count DESC, d.created_at DESC`;
      break;
    }
    case "home":
    case "for-you":
      if (opts.viewerId) {
        // Communities you joined + people you follow first, then everything else by hotness.
        order = sql`(CASE WHEN d.category IN (SELECT category FROM user_interests WHERE user_id = ${viewer}) OR d.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ${viewer}) THEN 1 ELSE 0 END) DESC, ${hot}`;
      } else order = hot;
      break;
    default:
      order = hot;
  }

  const rows = await db.all<FeedPost>(sql`
    SELECT d.id, d.kind, d.title, d.body, d.category, d.image_key AS imageKey, d.comment_count AS commentCount,
           d.reaction_count AS reactionCount, d.score, d.created_at AS createdAt, d.author_id AS authorId,
           p.username, p.display_name AS displayName, p.avatar_key AS avatarKey,
           pj.slug AS projectSlug, pj.title AS projectTitle, cp.slug AS convertedSlug, cp.title AS convertedTitle,
           (SELECT group_concat(r.kind) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.user_id = ${viewer}) AS myReactions,
           (SELECT value FROM votes vt WHERE vt.discussion_id = d.id AND vt.user_id = ${viewer}) AS myVote,
           cp.status AS convertedStatus, p.is_demo AS authorIsDemo,
           (SELECT count(DISTINCT c3.author_id) FROM comments c3 WHERE c3.discussion_id = d.id AND c3.status = 'published' AND c3.author_id != d.author_id) AS participants,
           (SELECT group_concat(n, '|') FROM (SELECT DISTINCT p3.display_name AS n FROM comments c4 JOIN profiles p3 ON p3.user_id = c4.author_id WHERE c4.discussion_id = d.id AND c4.status = 'published' AND c4.author_id != d.author_id ORDER BY c4.created_at DESC LIMIT 3)) AS participantNames,
           (SELECT count(*) FROM reactions r2 WHERE r2.target_type = 'discussion' AND r2.target_id = d.id AND r2.kind = 'helping') AS helpers,
           EXISTS (SELECT 1 FROM bookmarks bk WHERE bk.discussion_id = d.id AND bk.user_id = ${viewer}) AS bookmarked,
           (SELECT sc.repo_full_name FROM showcases sc WHERE sc.discussion_id = d.id) AS showcaseRepo
    FROM discussions d
    JOIN profiles p ON p.user_id = d.author_id
    LEFT JOIN projects pj ON pj.id = d.project_id
    LEFT JOIN projects cp ON cp.id = d.converted_project_id
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`);
  return { kind: "posts" as const, items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function getBookmarks(viewerId: string, page: number) {
  const db = getDb();
  const rows = await db.all<FeedPost>(sql`
    SELECT d.id, d.kind, d.title, d.body, d.category, d.image_key AS imageKey, d.comment_count AS commentCount,
           d.reaction_count AS reactionCount, d.score, d.created_at AS createdAt, d.author_id AS authorId,
           p.username, p.display_name AS displayName, p.avatar_key AS avatarKey,
           pj.slug AS projectSlug, pj.title AS projectTitle, cp.slug AS convertedSlug, cp.title AS convertedTitle,
           (SELECT group_concat(r.kind) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.user_id = ${viewerId}) AS myReactions,
           (SELECT value FROM votes vt WHERE vt.discussion_id = d.id AND vt.user_id = ${viewerId}) AS myVote,
           (SELECT count(*) FROM reactions r2 WHERE r2.target_type = 'discussion' AND r2.target_id = d.id AND r2.kind = 'helping') AS helpers,
           1 AS bookmarked
    FROM bookmarks bk JOIN discussions d ON d.id = bk.discussion_id
    JOIN profiles p ON p.user_id = d.author_id
    LEFT JOIN projects pj ON pj.id = d.project_id
    LEFT JOIN projects cp ON cp.id = d.converted_project_id
    WHERE bk.user_id = ${viewerId} AND ${visibilityFilter(viewerId)}
    ORDER BY bk.created_at DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`);
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export const FEED_POST_EXTRA_COLUMNS = (viewerId: string) => sql`
  d.score,
  (SELECT value FROM votes vt WHERE vt.discussion_id = d.id AND vt.user_id = ${viewerId}) AS myVote,
  (SELECT count(*) FROM reactions r2 WHERE r2.target_type = 'discussion' AND r2.target_id = d.id AND r2.kind = 'helping') AS helpers`;

export async function communityStats() {
  return getDb().all<{ category: string; members: number; posts: number }>(sql`
    SELECT c.category, (SELECT count(*) FROM user_interests ui WHERE ui.category = c.category) AS members,
      (SELECT count(*) FROM discussions d WHERE d.category = c.category AND d.status = 'published' AND d.project_id IS NULL) AS posts
    FROM (SELECT DISTINCT category FROM user_interests UNION SELECT DISTINCT category FROM discussions) c`);
}
