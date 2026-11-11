"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, MessageSquareReply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addComment, deleteComment } from "@/server/discussions";
import type { CommentRow } from "@/server/queries/discussion";
import { renderMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { TimeAgo } from "@/components/time-ago";
import { ReportDialog } from "@/components/report-dialog";

function CommentBox({ discussionId, parentId, onDone, autoFocus, placeholder }: { discussionId: string; parentId?: string; onDone?: () => void; autoFocus?: boolean; placeholder: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  async function send() {
    if (!body.trim()) return;
    setPending(true);
    const res = await addComment({ discussionId, parentId: parentId ?? null, body });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setBody("");
    onDone?.();
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        autoFocus={autoFocus}
        maxLength={5000}
        rows={parentId ? 2 : 3}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
        }}
      />
      <div className="flex justify-end gap-2">
        {onDone && <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
        <Button size="sm" onClick={send} disabled={pending || !body.trim()}>{pending ? "Posting…" : parentId ? "Reply" : "Comment"}</Button>
      </div>
    </div>
  );
}

function CommentItem({ c, replies, viewerId, canModerate, discussionId, canReply }: { c: CommentRow; replies: CommentRow[]; viewerId: string | null; canModerate: boolean; discussionId: string; canReply: boolean }) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const removed = c.status !== "published";
  return (
    <li id={`c-${c.id}`} className="scroll-mt-20">
      <div className="flex gap-3">
        <Link href={`/u/${c.username}`} className="shrink-0"><UserAvatar name={c.displayName} avatarKey={c.avatarKey} size={32} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
            {removed ? <span className="text-muted-foreground">[removed]</span> : <Link href={`/u/${c.username}`} className="font-medium hover:underline">{c.displayName}</Link>}
            <span className="text-xs text-muted-foreground"><TimeAgo date={c.createdAt} /></span>
          </div>
          {removed ? (
            <p className="text-sm italic text-muted-foreground">This comment was deleted.</p>
          ) : (
            <div className="prose-cg mt-0.5 text-[0.93rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }} />
          )}
          {!removed && viewerId && (
            <div className="-ml-2 mt-1 flex gap-0.5 text-xs text-muted-foreground">
              {canReply && <button type="button" onClick={() => setReplying(!replying)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-muted hover:text-foreground"><MessageSquareReply className="size-3.5" /> Reply</button>}
              {viewerId !== c.authorId && <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-muted hover:text-foreground"><Flag className="size-3.5" /> Report</button>}
              {(viewerId === c.authorId || canModerate) && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await deleteComment(c.id);
                    if (!res.ok) toast.error(res.error);
                    else router.refresh();
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              )}
            </div>
          )}
          {replying && <div className="mt-2"><CommentBox discussionId={discussionId} parentId={c.id} autoFocus onDone={() => setReplying(false)} placeholder={`Reply to ${c.displayName}`} /></div>}
          {replies.length > 0 && (
            <ul className="mt-3 flex flex-col gap-4 border-l-2 pl-4">
              {replies.map((r) => <CommentItem key={r.id} c={r} replies={[]} viewerId={viewerId} canModerate={canModerate} discussionId={discussionId} canReply={canReply} />)}
            </ul>
          )}
        </div>
      </div>
      <ReportDialog open={reporting} onOpenChange={setReporting} targetType="comment" targetId={c.id} />
    </li>
  );
}

export function CommentsSection({ discussionId, comments, viewerId, canComment, canModerate, signInHref }: { discussionId: string; comments: CommentRow[]; viewerId: string | null; canComment: boolean; canModerate: boolean; signInHref: string }) {
  const top = comments.filter((c) => !c.parentId);
  const byParent = new Map<string, CommentRow[]>();
  for (const c of comments) if (c.parentId) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const count = comments.filter((c) => c.status === "published").length;
  return (
    <section id="comments" aria-label="Comments" className="scroll-mt-20">
      <h2 className="mb-4 text-base font-semibold">{count} {count === 1 ? "comment" : "comments"}</h2>
      {canComment ? (
        <div className="mb-6"><CommentBox discussionId={discussionId} placeholder="Add to the conversation…" /></div>
      ) : (
        <p className="mb-6 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          {viewerId ? "Confirm your email and finish your profile to join the conversation." : <><Link href={signInHref} className="font-medium text-primary hover:underline">Sign in</Link> to join the conversation.</>}
        </p>
      )}
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet — be the first to respond.</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {top.map((c) => <CommentItem key={c.id} c={c} replies={byParent.get(c.id) ?? []} viewerId={viewerId} canModerate={canModerate} discussionId={discussionId} canReply={canComment} />)}
        </ul>
      )}
    </section>
  );
}
