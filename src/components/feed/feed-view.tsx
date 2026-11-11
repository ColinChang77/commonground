import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SORT_TABS, TOP_PERIODS, type FeedPost } from "@/server/queries/feed";
import { PostCard } from "@/components/feed/post-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SortBar({ base, sort, period, showHome }: { base: string; sort: string; period?: string; showHome: boolean }) {
  const href = (s: string, p?: string) => { const u = new URLSearchParams(); if (s !== (showHome ? "home" : "hot")) u.set("sort", s); if (p) u.set("t", p); return u.size ? `${base}?${u}` : base; };
  const tabs = [...(showHome ? [{ id: "home", label: "For you", emoji: "🏠" }] : []), ...SORT_TABS];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1.5">
      {tabs.map((t) => (
        <Link key={t.id} href={href(t.id)} aria-current={sort === t.id ? "page" : undefined} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors", sort === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
          <span aria-hidden>{t.emoji}</span> {t.label}
        </Link>
      ))}
      {sort === "top" && (
        <div className="ml-auto flex flex-wrap gap-1">
          {TOP_PERIODS.map((p) => (
            <Link key={p.id} href={href("top", p.id === "week" ? undefined : p.id)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", (period ?? "week") === p.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>{p.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function FeedList({ items, viewerId, hideCommunity, emptyAction, page, hasMore, pageHref }: { items: FeedPost[]; viewerId: string | null; hideCommunity?: boolean; emptyAction?: React.ReactNode; page: number; hasMore: boolean; pageHref: (p: number) => string }) {
  if (!items.length)
    return <EmptyState icon={Sparkles} title={page > 0 ? "You've reached the end" : "No posts here yet"} action={page === 0 ? emptyAction : undefined}>{page > 0 ? "That's everything for now." : "Be the first to start a conversation."}</EmptyState>;
  return (
    <>
      <div className="flex flex-col gap-2.5">{items.map((p) => <PostCard key={p.id} post={p} viewerId={viewerId} hideCommunity={hideCommunity} />)}</div>
      {(page > 0 || hasMore) && (
        <nav aria-label="Pagination" className="mt-5 flex justify-between">
          {page > 0 ? <Button asChild variant="outline" className="rounded-full"><Link href={pageHref(page - 1)}>Previous</Link></Button> : <span />}
          {hasMore && <Button asChild variant="outline" className="rounded-full"><Link href={pageHref(page + 1)}>Load more</Link></Button>}
        </nav>
      )}
    </>
  );
}
