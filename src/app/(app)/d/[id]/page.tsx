import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FolderKanban, Wand2 } from "lucide-react";
import { getViewer, isStaff } from "@/lib/session";
import { getDiscussion } from "@/server/queries/discussion";
import { communityName } from "@/lib/constants";
import { VoteColumn } from "@/components/feed/vote-column";
import { CommunityIcon } from "@/components/community-icon";
import { excerpt } from "@/lib/markdown";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { TimeAgo } from "@/components/time-ago";
import { PostActions } from "@/components/feed/post-actions";
import { KindBadge } from "@/components/feed/post-card";
import { CommentsSection } from "@/components/comments";
import { ProjectStatusBadge } from "@/components/project-status";
import { Button } from "@/components/ui/button";
import { RoomProvider } from "@/components/realtime/room-provider";
import { PresenceBar } from "@/components/realtime/presence-bar";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const data = await getDiscussion((await params).id, null);
  return data ? { title: data.d.title, description: excerpt(data.d.body, 160) } : { title: "Not found" };
}

export default async function DiscussionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const data = await getDiscussion(id, viewer?.id ?? null);
  if (!data) notFound();
  const { d, meta, reactionCounts, comments } = data;
  const isAuthor = viewer?.id === d.authorId;
  const canComment = Boolean(viewer?.emailVerified && viewer.profile && !viewer.profile.suspendedAt);
  const canConvert = isAuthor && !d.convertedProjectId && !d.projectId && d.kind !== "update";
  void reactionCounts;

  return (
    <RoomProvider room={`d:${d.id}`} selfId={viewer?.profile ? viewer.id : null}>
    <div className="mx-auto max-w-[800px] px-3 py-4 md:px-6 md:py-6">
      <Link href={d.projectId && meta.projectSlug ? `/p/${meta.projectSlug}/discussion` : "/"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {d.projectId && meta.projectTitle ? meta.projectTitle : "Back to feed"}
      </Link>
      <article className="flex overflow-hidden rounded-xl border bg-card">
        <div className="hidden w-14 shrink-0 justify-center bg-muted/40 pt-3 sm:flex">
          <VoteColumn id={d.id} score={d.score} myVote={meta.myVote} signedIn={Boolean(viewer)} />
        </div>
        <div className="min-w-0 flex-1 p-4 md:p-5">
          <header className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <Link href={`/c/${d.category}`} className="flex items-center gap-1.5 font-bold text-foreground hover:underline"><CommunityIcon id={d.category} size={22} /> {communityName(d.category)}</Link>
            <span aria-hidden>•</span>
            <span className="flex items-center gap-1">Posted by <Link href={`/u/${meta.username}`} className="flex items-center gap-1 hover:underline"><UserAvatar name={meta.displayName} avatarKey={meta.avatarKey} size={16} /> u/{meta.username}</Link></span>
            <span aria-hidden>•</span>
            <TimeAgo date={d.createdAt} />
            <KindBadge kind={d.kind} />
          </header>
          <h1 className="text-xl font-bold leading-snug md:text-2xl">{d.title}</h1>
          {d.body && <Markdown source={d.body} className="mt-3" />}
          {d.imageKey && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/media/${d.imageKey}`} alt="" className="mt-4 w-full rounded-xl border" />
          )}
          {meta.convertedSlug && (
            <Link href={`/p/${meta.convertedSlug}`} className="mt-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-accent/60 p-3 hover:bg-accent">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><FolderKanban className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-accent-foreground/80">🎉 This discussion became a project</span>
                <span className="block truncate font-semibold text-accent-foreground">{meta.convertedTitle}</span>
              </span>
              {meta.convertedStatus && <ProjectStatusBadge status={meta.convertedStatus} className="hidden bg-background sm:inline-flex" />}
              <ArrowUpRight className="size-4 text-accent-foreground" aria-hidden />
            </Link>
          )}
          <div className="-ml-2 mt-3 flex items-center gap-1">
            <div className="sm:hidden"><VoteColumn id={d.id} score={d.score} myVote={meta.myVote} signedIn={Boolean(viewer)} horizontal /></div>
            <PostActions id={d.id} title={d.title} commentCount={d.commentCount} myReactions={meta.myReactions ? meta.myReactions.split(",") : []} helpers={meta.helpers} bookmarked={Boolean(meta.bookmarked)} signedIn={Boolean(viewer)} isAuthor={isAuthor} canModerate={isStaff(viewer)} />
          </div>
        </div>
      </article>

      {canConvert && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-dashed border-primary/50 bg-accent/30 p-4 sm:flex-row sm:items-center">
          <Wand2 className="size-5 shrink-0 text-primary" aria-hidden />
          <p className="flex-1 text-sm"><strong>People are interested — ready to make it real?</strong> Turn this post into a project: you can list the help you need, hand out to-dos and give people credit. This conversation stays attached.</p>
          <Button asChild><Link href={`/d/${d.id}/convert`}>Turn into Project</Link></Button>
        </div>
      )}

      <div className="mt-3 rounded-xl border bg-card p-4 md:p-5">
        <div className="mb-3"><PresenceBar /></div>
        <CommentsSection discussionId={d.id} comments={comments} viewerId={viewer?.id ?? null} canComment={canComment} canModerate={isStaff(viewer)} signInHref={`/sign-in?next=/d/${d.id}`} />
      </div>
    </div>
    </RoomProvider>
  );
}
