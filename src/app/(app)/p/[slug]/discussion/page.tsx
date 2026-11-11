import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { MessagesSquare } from "lucide-react";
import { getDb } from "@/db";
import { loadProject } from "@/server/queries/project";
import { FEED_POST_EXTRA_COLUMNS, type FeedPost } from "@/server/queries/feed";
import { PostCard } from "@/components/feed/post-card";
import { EmptyState } from "@/components/empty-state";
import { Composer } from "@/components/create/composer";
import type { CategoryId } from "@/lib/constants";

export default async function ProjectDiscussion({ params }: { params: Promise<{ slug: string }> }) {
  const data = await loadProject((await params).slug);
  if (!data) notFound();
  const { project, viewer, access } = data;
  const v = viewer?.id ?? "";
  const posts = await getDb().all<FeedPost>(sql`
    SELECT d.id, d.kind, d.title, d.body, d.category, d.image_key AS imageKey, d.comment_count AS commentCount, d.reaction_count AS reactionCount, ${FEED_POST_EXTRA_COLUMNS(v)},
      d.created_at AS createdAt, d.author_id AS authorId, p.username, p.display_name AS displayName, p.avatar_key AS avatarKey,
      NULL AS projectSlug, NULL AS projectTitle, NULL AS convertedSlug, NULL AS convertedTitle,
      (SELECT group_concat(kind) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.user_id = ${v}) AS myReactions,
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.discussion_id = d.id AND b.user_id = ${v}) AS bookmarked
    FROM discussions d JOIN profiles p ON p.user_id = d.author_id
    WHERE d.project_id = ${project.id} AND d.kind != 'update' AND d.status = 'published' AND p.suspended_at IS NULL
    ORDER BY d.last_activity_at DESC LIMIT 50`);
  const canPost = access.can("discussion.post") && viewer?.emailVerified;
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      {canPost && (
        <details className="group rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground group-open:mb-4 group-open:text-foreground">+ Start a project discussion</summary>
          <Composer initialKind="discussion" projectId={project.id} defaultCategory={project.category as CategoryId} />
        </details>
      )}
      {posts.length ? (
        <div className="flex flex-col gap-3">{posts.map((p) => <PostCard key={p.id} post={p} viewerId={viewer?.id ?? null} />)}</div>
      ) : (
        <EmptyState icon={MessagesSquare} title="No project discussions yet">{canPost ? "Start a thread to plan, ask questions or share progress with the team." : "Members' conversations about this project will appear here."}</EmptyState>
      )}
      {project.visibility === "private" && <p className="text-center text-xs text-muted-foreground">Discussions in private projects are only visible to members.</p>}
    </div>
  );
}
