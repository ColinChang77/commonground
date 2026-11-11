import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { interests } from "@/db/schema";
import { getViewer } from "@/lib/session";
import { CATEGORIES, communityName } from "@/lib/constants";
import { communityStats, getFeed, type FeedTab } from "@/server/queries/feed";
import { PageColumns } from "@/components/shell/app-shell";
import { FeedList, SortBar } from "@/components/feed/feed-view";
import { CommunityIcon } from "@/components/community-icon";
import { JoinCommunity } from "@/components/join-community";
import { Button } from "@/components/ui/button";

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }) {
  const { community } = await params;
  const c = CATEGORIES.find((x) => x.id === community);
  return { title: c ? communityName(c.id) : "Community not found", description: c?.blurb };
}

export default async function CommunityPage({ params, searchParams }: { params: Promise<{ community: string }>; searchParams: Promise<{ sort?: string; t?: string; page?: string }> }) {
  const { community } = await params;
  const c = CATEGORIES.find((x) => x.id === community);
  if (!c) notFound();
  const sp = await searchParams;
  const viewer = await getViewer();
  const sort = (["hot", "new", "top"].includes(sp.sort ?? "") ? sp.sort : "hot") as FeedTab;
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const feed = await getFeed({ tab: sort, viewerId: viewer?.id ?? null, category: c.id, page, period: sp.t });
  const stats = (await communityStats()).find((s) => s.category === c.id);
  const joined = viewer ? (await getDb().select().from(interests).where(and(eq(interests.userId, viewer.id), eq(interests.category, c.id))).limit(1)).length > 0 : false;
  const pageHref = (p: number) => { const u = new URLSearchParams(); if (sp.sort) u.set("sort", sp.sort); if (sp.t) u.set("t", sp.t); if (p) u.set("page", String(p)); return u.size ? `/c/${c.id}?${u}` : `/c/${c.id}`; };
  return (
    <div>
      <div className="h-20 bg-gradient-to-r from-primary/60 via-primary/30 to-[oklch(0.82_0.1_85)] md:h-24" />
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-[1100px] items-end gap-3 px-3 pb-3 md:px-6">
          <CommunityIcon id={c.id} size={72} className="-mt-8 border-4 border-card" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-2xl font-bold leading-tight">{c.label}</h1>
            <p className="text-sm text-muted-foreground">{communityName(c.id)}</p>
          </div>
          <div className="flex gap-2 pb-1">
            {viewer?.profile && <Button asChild variant="outline" className="hidden rounded-full sm:inline-flex"><Link href={`/create?community=${c.id}`}>Create post</Link></Button>}
            <JoinCommunity id={c.id} joined={joined} signedIn={Boolean(viewer?.profile)} />
          </div>
        </div>
      </div>
      <PageColumns
        aside={
          <div className="sticky top-20 flex flex-col gap-4">
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-1 text-sm font-bold">About this community</h2>
              <p className="text-sm">{c.blurb}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                <div><dt className="text-xs text-muted-foreground">Members</dt><dd className="text-lg font-bold tabular-nums">{stats?.members ?? 0}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Posts</dt><dd className="text-lg font-bold tabular-nums">{stats?.posts ?? 0}</dd></div>
              </dl>
              {viewer?.profile && <Button asChild className="mt-3 w-full rounded-full"><Link href={`/create?community=${c.id}`}>Create post</Link></Button>}
            </section>
            <section className="rounded-xl border bg-card p-4 text-sm">
              <h2 className="mb-2 font-bold">Community rules</h2>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Be kind — critique ideas, not people.</li>
                <li>Credit others honestly, and say when AI helped.</li>
                <li>No spam or paid “join fees”.</li>
              </ol>
              <Link href="/legal/guidelines" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">Full guidelines</Link>
            </section>
          </div>
        }
      >
        <div className="mx-auto max-w-[760px]">
          <SortBar base={`/c/${c.id}`} sort={sort} period={sp.t} showHome={false} />
          <FeedList items={feed.kind === "posts" ? feed.items : []} viewerId={viewer?.id ?? null} hideCommunity page={page} hasMore={feed.hasMore} pageHref={pageHref} emptyAction={viewer?.profile ? <Button asChild className="rounded-full"><Link href={`/create?community=${c.id}`}>Start the first post</Link></Button> : undefined} />
        </div>
      </PageColumns>
    </div>
  );
}
