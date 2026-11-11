import Link from "next/link";
import { eq } from "drizzle-orm";
import { PenLine } from "lucide-react";
import { getDb } from "@/db";
import { interests } from "@/db/schema";
import { getViewer } from "@/lib/session";
import { communityStats, getFeed, type FeedTab } from "@/server/queries/feed";
import { openOpportunities } from "@/server/queries/sidebar";
import { gettingStarted } from "@/server/queries/onboarding";
import { PageColumns } from "@/components/shell/app-shell";
import { FeedList, SortBar } from "@/components/feed/feed-view";
import { HelpWanted, PopularCommunities } from "@/components/feed/sidebar-widgets";
import { GettingStarted } from "@/components/getting-started";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ sort?: string; t?: string; page?: string; tab?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const legacy: Record<string, string> = { latest: "new", trending: "hot", "for-you": "home" };
  const requested = sp.sort ?? (sp.tab ? legacy[sp.tab] ?? sp.tab : undefined);
  const sort = (["home", "hot", "new", "top"].includes(requested ?? "") ? requested : viewer ? "home" : "hot") as FeedTab;
  const effective = sort === "home" && !viewer ? "hot" : sort;
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const feed = await getFeed({ tab: effective, viewerId: viewer?.id ?? null, page, period: sp.t });
  const posts = feed.kind === "posts" ? feed.items : [];
  const [opps, stats] = await Promise.all([openOpportunities(), communityStats()]);
  const joined = viewer ? (await getDb().select({ c: interests.category }).from(interests).where(eq(interests.userId, viewer.id))).map((r) => r.c) : [];
  const steps = viewer?.profile ? await gettingStarted(viewer.id) : null;
  const pageHref = (p: number) => { const u = new URLSearchParams(); if (sp.sort) u.set("sort", sp.sort); if (sp.t) u.set("t", sp.t); if (p) u.set("page", String(p)); return u.size ? `/?${u}` : "/"; };

  return (
    <PageColumns
      aside={
        <div className="sticky top-20 flex flex-col gap-4">
          {!viewer && (
            <section className="overflow-hidden rounded-xl border bg-card">
              <div className="h-14 bg-gradient-to-r from-primary/70 via-primary/40 to-[oklch(0.8_0.12_85)]" />
              <div className="p-4">
                <h2 className="font-heading text-lg font-bold leading-tight">Where ideas find their people.</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">Share an idea, see who wants to help, and build it together — from a book club to an app.</p>
                <Button asChild className="mt-3 w-full rounded-full"><Link href="/sign-up">Join CommonGround</Link></Button>
                <Button asChild variant="outline" className="mt-2 w-full rounded-full"><Link href="/guide">How it works</Link></Button>
              </div>
            </section>
          )}
          {steps && <GettingStarted steps={steps} />}
          <HelpWanted opps={opps} />
          <PopularCommunities stats={stats} joined={joined} signedIn={Boolean(viewer?.profile)} />
        </div>
      }
    >
      <div className="mx-auto max-w-[760px]">
        <h1 className="sr-only">Home</h1>
        {viewer?.profile && (
          <Link href="/create" className="mb-3 flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-muted-foreground transition-colors hover:border-foreground/25">
            <UserAvatar name={viewer.profile.displayName} avatarKey={viewer.profile.avatarKey} size={36} />
            <span className="flex-1 rounded-full bg-muted/70 px-4 py-2 text-sm">Share an idea or ask a question…</span>
            <PenLine className="size-5" aria-hidden />
          </Link>
        )}
        {steps && <div className="mb-3 lg:hidden"><GettingStarted steps={steps} idSuffix="-m" /></div>}
        <SortBar base="/" sort={sort} period={sp.t} showHome={Boolean(viewer)} />
        <FeedList items={posts} viewerId={viewer?.id ?? null} page={page} hasMore={feed.hasMore} pageHref={pageHref} emptyAction={viewer?.profile ? <Button asChild className="rounded-full"><Link href="/create">Create a post</Link></Button> : undefined} />
      </div>
    </PageColumns>
  );
}
