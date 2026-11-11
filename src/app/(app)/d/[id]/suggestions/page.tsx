import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { ArrowLeft, Filter } from "lucide-react";
import { getDb } from "@/db";
import { discussions, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getViewer } from "@/lib/session";
import { canDecideSuggestion } from "@/lib/permissions";
import { funnel, getShowcase, listSuggestions } from "@/lib/suggestions";
import { COPY } from "@/lib/copy";
import { RoomProvider } from "@/components/realtime/room-provider";
import { PresenceBar } from "@/components/realtime/presence-bar";
import { InboxCard, type InboxItem } from "@/components/showcase/inbox-card";

export const metadata = { title: "Suggestions inbox" };

const COLUMNS: { id: string; label: string; statuses: string[] }[] = [
  { id: "waiting", label: "Waiting on commenter", statuses: ["confirming", "preview_recorded"] },
  { id: "running", label: "Agents working", statuses: ["queued", "running", "reviewing"] },
  { id: "approve", label: "Needs my approval", statuses: ["sent", "builder_review"] },
  { id: "pr", label: "PR opened / merged", statuses: ["pr_opened", "merged"] },
  { id: "filtered", label: "Filtered", statuses: ["filtered", "declined"] },
];

/** Builder-only overview of one showcase: a real funnel and every comment by state, including what the filter held back. */
export default async function SuggestionsInbox({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const db = getDb();
  const sc = await getShowcase(db, id);
  if (!sc || !canDecideSuggestion(viewer?.id ?? null, sc.builderId)) notFound();
  const [d] = await db.select({ title: discussions.title }).from(discussions).where(eq(discussions.id, id)).limit(1);
  const rows = await listSuggestions(db, id);
  const f = await funnel(db, sc);
  const names = rows.length ? await db.select({ id: profiles.userId, n: profiles.displayName }).from(profiles).where(inArray(profiles.userId, [...new Set(rows.map((r) => r.authorId))])) : [];
  const items: InboxItem[] = rows.map((r) => ({ id: r.id, title: r.title, restated: r.restated, status: r.status, quality: r.quality, reason: r.reason, author: names.find((x) => x.id === r.authorId)?.n ?? "Someone", previewVideoUrl: r.previewVideoUrl, prNumber: r.prNumber }));
  const steps = [
    { label: "Comments", n: f.comments },
    { label: "Actionable", n: f.actionable },
    { label: "Commenter confirmed", n: f.confirmed },
    { label: "Recording approved", n: f.recordingApproved },
    { label: "PR opened", n: f.prOpened },
    { label: "Merged", n: f.merged },
  ];
  return (
    <RoomProvider room={`d:${id}`} selfId={viewer?.id ?? null}>
      <div className="mx-auto max-w-[1100px] px-3 py-4 md:px-6 md:py-6">
        <Link href={`/d/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to the thread</Link>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">Suggestions inbox</h1>
          <span className="font-mono text-xs text-muted-foreground">{sc.repoFullName}</span>
          {sc.demoMode ? <span className="rounded-full border border-dashed px-2 py-0.5 text-[0.7rem] text-muted-foreground">{COPY.demoBadge}</span> : null}
          <div className="ml-auto"><PresenceBar /></div>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{d?.title} · Only comments that pass all three checks — the commenter confirms, the commenter approves the recording, you approve — become pull requests.</p>
        <section data-testid="funnel" aria-label="Funnel" className="mb-4 grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 sm:grid-cols-6">
          {steps.map((st, i) => (
            <div key={st.label} className="relative rounded-lg bg-muted/50 px-2.5 py-2">
              <div className="text-2xl font-bold tabular-nums" data-testid={`funnel-${i}`}>{st.n}</div>
              <div className="text-xs text-muted-foreground">{st.label}</div>
            </div>
          ))}
        </section>
        <div className="grid gap-3 md:grid-cols-5">
          {COLUMNS.map((c) => {
            const list = items.filter((it) => c.statuses.includes(it.status));
            return (
              <section key={c.id} data-testid={`col-${c.id}`} className={c.id === "filtered" ? "rounded-xl border border-dashed bg-muted/30 p-2.5" : "rounded-xl border bg-card p-2.5"}>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">{c.id === "filtered" && <Filter className="size-3.5" aria-hidden />}{c.label} <span className="ml-auto rounded-full bg-muted px-1.5 text-xs tabular-nums">{list.length}</span></h2>
                <div className="flex flex-col gap-2">{list.length ? list.map((it) => <InboxCard key={it.id} item={it} />) : <p className="text-xs text-muted-foreground">Nothing here.</p>}</div>
              </section>
            );
          })}
        </div>
      </div>
    </RoomProvider>
  );
}
