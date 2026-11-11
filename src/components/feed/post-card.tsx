import Link from "next/link";
import { ArrowUpRight, FolderKanban, Lightbulb, Megaphone } from "lucide-react";
import type { FeedPost } from "@/server/queries/feed";
import { communityName } from "@/lib/constants";
import { excerpt } from "@/lib/markdown";
import { TimeAgo } from "@/components/time-ago";
import { PostActions } from "@/components/feed/post-actions";
import { VoteColumn } from "@/components/feed/vote-column";
import { CommunityIcon } from "@/components/community-icon";
import { SampleBadge } from "@/components/sample-badge";

export function KindBadge({ kind }: { kind: string }) {
  if (kind === "idea")
    return <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.94_0.07_85)] px-2 py-0.5 text-[0.7rem] font-semibold text-[oklch(0.42_0.09_70)] dark:bg-[oklch(0.32_0.06_80)] dark:text-[oklch(0.9_0.09_85)]"><Lightbulb className="size-3" aria-hidden /> Idea</span>;
  if (kind === "update")
    return <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-semibold text-accent-foreground"><Megaphone className="size-3" aria-hidden /> Project news</span>;
  return null;
}

const CTA: Record<string, string> = { exploring: "See the project", recruiting: "See how to help", building: "See what\u2019s happening", completed: "Explore the outcome", archived: "See the project" };

export function PostCard({ post, viewerId, hideCommunity = false }: { post: FeedPost; viewerId: string | null; hideCommunity?: boolean }) {
  return (
    <article className="group relative flex overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25">
      <div className="hidden w-12 shrink-0 justify-center bg-muted/40 pt-2 sm:flex">
        <VoteColumn id={post.id} score={post.score ?? 0} myVote={post.myVote} signedIn={Boolean(viewerId)} />
      </div>
      <div className="min-w-0 flex-1 px-3 pb-1.5 pt-2.5 sm:px-4">
        <header className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {!hideCommunity && (
            <Link href={`/c/${post.category}`} className="relative z-10 flex items-center gap-1.5 font-bold text-foreground hover:underline">
              <CommunityIcon id={post.category} size={20} /> {communityName(post.category)}
            </Link>
          )}
          {!hideCommunity && <span aria-hidden>•</span>}
          <span>Posted by <Link href={`/u/${post.username}`} className="relative z-10 hover:underline">u/{post.username}</Link></span>
          <span aria-hidden>•</span>
          <TimeAgo date={post.createdAt} />
          {post.authorIsDemo ? <SampleBadge /> : null}
          <KindBadge kind={post.kind} />
          {post.showcaseRepo && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-semibold text-primary-foreground">Showcase · <span className="font-mono">{post.showcaseRepo}</span></span>}
          {post.projectSlug && post.kind === "update" && <Link href={`/p/${post.projectSlug}`} className="relative z-10 font-semibold text-primary hover:underline">{post.projectTitle}</Link>}
        </header>
        <div className="mt-1 flex gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-snug">
              <Link href={`/d/${post.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{post.title}</Link>
            </h2>
            {post.body && <p className="mt-1 line-clamp-3 text-sm text-foreground/75">{excerpt(post.body, 300)}</p>}
          </div>
          {post.imageKey && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/media/${post.imageKey}`} alt="" loading="lazy" className="size-20 shrink-0 rounded-lg border object-cover sm:size-24" />
          )}
        </div>
        {(post.participants ?? 0) > 0 && (
          <p className="mt-2 text-xs text-muted-foreground"><span aria-hidden>💬 </span><strong className="font-semibold text-foreground">{(post.participantNames ?? "").split("|").filter(Boolean).map((n) => n.split(" ")[0]).join(", ")}</strong>{(post.participants ?? 0) > 3 ? ` +${(post.participants ?? 0) - 3}` : ""} {(post.participants ?? 0) === 1 ? "is" : "are"} talking about this</p>
        )}
        {post.convertedSlug ? (
          <Link href={`/p/${post.convertedSlug}`} className="relative z-10 mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-accent/60 px-3 py-2 text-sm text-accent-foreground hover:bg-accent">
            <FolderKanban className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate"><span className="hidden sm:inline">Now a project: </span><strong>{post.convertedTitle}</strong></span>
            <span className="shrink-0 font-semibold">{CTA[post.convertedStatus ?? "exploring"] ?? "See the project"}</span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : post.kind !== "update" ? (
          <Link href={`/d/${post.id}#comments`} className="relative z-10 mt-2 inline-flex text-sm font-semibold text-primary hover:underline">{post.commentCount === 0 ? "Be the first to reply →" : "Join the conversation →"}</Link>
        ) : null}
        <div className="relative z-10 -ml-2 mt-1.5 flex items-center gap-1">
          <div className="sm:hidden"><VoteColumn id={post.id} score={post.score ?? 0} myVote={post.myVote} signedIn={Boolean(viewerId)} horizontal /></div>
          <PostActions id={post.id} title={post.title} commentCount={post.commentCount} myReactions={post.myReactions ? post.myReactions.split(",") : []} helpers={post.helpers ?? 0} bookmarked={Boolean(post.bookmarked)} signedIn={Boolean(viewerId)} isAuthor={viewerId === post.authorId} />
        </div>
      </div>
    </article>
  );
}
