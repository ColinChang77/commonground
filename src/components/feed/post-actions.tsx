"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Flag, Hand, MessageSquare, MoreHorizontal, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { toggleBookmark, toggleReaction, deleteDiscussion } from "@/server/discussions";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ReportDialog } from "@/components/report-dialog";

const pill = "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 sm:px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function PostActions({
  id, commentCount, myReactions, helpers = 0, bookmarked: initialBookmarked, signedIn, isAuthor, canModerate, title,
}: {
  id: string; commentCount: number; myReactions: string[]; helpers?: number; bookmarked: boolean; signedIn: boolean; isAuthor: boolean; canModerate?: boolean; title: string;
}) {
  const router = useRouter();
  const [helping, setHelping] = useState({ on: myReactions.includes("helping"), n: helpers });
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [reportOpen, setReportOpen] = useState(false);
  const [, start] = useTransition();
  const needAuth = () => router.push(`/sign-in?next=${encodeURIComponent(`/d/${id}`)}`);

  const toggleHelp = () => {
    if (!signedIn) return needAuth();
    const prev = helping;
    setHelping({ on: !prev.on, n: prev.n + (prev.on ? -1 : 1) });
    start(async () => {
      const res = await toggleReaction(id, "helping");
      if (!res.ok) { setHelping(prev); toast.error(res.error); }
      else if (!prev.on) toast.success("Nice! The author can see you'd like to help.");
    });
  };
  const share = async () => {
    const url = `${location.origin}/d/${id}`;
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  };

  return (
    <div className="flex items-center gap-0.5">
      <Link href={`/d/${id}#comments`} className={pill}>
        <MessageSquare className="size-4" aria-hidden /> {commentCount}<span className="hidden sm:inline"> {commentCount === 1 ? "Comment" : "Comments"}</span>
      </Link>
      <button type="button" onClick={toggleHelp} aria-pressed={helping.on} title="Let the author know you'd like to help" className={cn(pill, helping.on && "bg-accent text-accent-foreground hover:bg-accent")}>
        <Hand className="size-4" aria-hidden /> <span className="hidden sm:inline">{helping.on ? "You'd help" : "I'd help"}</span><span className="sm:hidden">{helping.on ? "In" : "Help"}</span>{helping.n > 0 ? ` · ${helping.n}` : ""}
      </button>
      <button type="button" onClick={share} className={pill}><Share2 className="size-4" aria-hidden /><span className="hidden sm:inline"> Share</span><span className="sr-only sm:hidden">Share</span></button>
      <button
        type="button"
        aria-pressed={bookmarked}
        onClick={() => {
          if (!signedIn) return needAuth();
          setBookmarked(!bookmarked);
          start(async () => { const res = await toggleBookmark(id); if (!res.ok) { setBookmarked(bookmarked); toast.error(res.error); } });
        }}
        className={cn(pill, bookmarked && "text-primary")}
      >
        <Bookmark className={cn("size-4", bookmarked && "fill-current")} aria-hidden /><span className="hidden sm:inline"> {bookmarked ? "Saved" : "Save"}</span><span className="sr-only sm:hidden">{bookmarked ? "Saved" : "Save"}</span>
      </button>
      {signedIn && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More actions" className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isAuthor && <DropdownMenuItem onSelect={() => setReportOpen(true)}><Flag /> Report</DropdownMenuItem>}
            {(isAuthor || canModerate) && (
              <DropdownMenuItem variant="destructive" onSelect={() => start(async () => { const res = await deleteDiscussion(id); if (!res.ok) toast.error(res.error); else { toast.success(res.message); router.refresh(); } })}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="discussion" targetId={id} />
    </div>
  );
}
