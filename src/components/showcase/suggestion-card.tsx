"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, CircleDashed, Film, GitPullRequest, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { confirmChange, decideChange, reviewPreview } from "@/server/suggestions";
import { BUILDER_STATUS, COPY, STEP_ORDER, VIEWER_STATUS } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SuggestionView = {
  id: string; authorId: string; title: string; restated: string; question: string | null; status: string; preview: string | null; prNumber: number | null; risk: string;
  quality: string; reason: string; aiReply: string | null; previewVideoUrl: string | null; round: number;
  events: { id: string; actor: string; message: string }[];
};

const STEPS = ["queued", "running", "reviewing", "preview_recorded", "sent", "pr_opened"] as const;
const STEP_LABEL: Record<string, string> = { queued: "Received", running: "Making the change", reviewing: "Double-checking", preview_recorded: "Preview recorded", sent: "Sent to the maker", pr_opened: "Adopted" };
const ACTOR: Record<string, string> = { triage: "Triage agent", coding: "Coding agent", review: "Review agent", system: "CommonGround", viewer: "Commenter", builder: "Maker" };

/** The three human gates every change passes before a pull request exists. */
export function Gates({ status, builder }: { status: string; builder: boolean }) {
  const idx = STEP_ORDER.indexOf(status as (typeof STEP_ORDER)[number]);
  const passed = [idx >= 1, idx >= STEP_ORDER.indexOf("sent"), idx >= STEP_ORDER.indexOf("pr_opened")];
  const labels = builder ? COPY.builderGates : COPY.gates;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Checks before anything is changed">
      {labels.map((l, i) => (
        <span key={l} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium", passed[i] ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground")}>
          {passed[i] ? <ShieldCheck className="size-3" /> : <CircleDashed className="size-3" />} {i + 1}. {l}
        </span>
      ))}
    </div>
  );
}

export function Recording({ url, note = true }: { url: string; note?: boolean }) {
  return (
    <figure className="mt-2">
      <video data-testid="preview-video" src={url} controls autoPlay muted loop playsInline className="w-full max-w-[420px] rounded-lg border bg-black" aria-label="Before and after screen recording" />
      {note && <figcaption className="mt-1 text-[0.68rem] text-muted-foreground">{COPY.recordingNote}</figcaption>}
    </figure>
  );
}

export function SuggestionCard({ s, viewerId, isBuilder, repo }: { s: SuggestionView; viewerId: string | null; isBuilder: boolean; repo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const mine = viewerId === s.authorId;
  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setPending(key);
    const res = await fn();
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Something went wrong.");
    else { if (res.message) toast.success(res.message); setRevising(false); router.refresh(); }
  };

  // Filtered comments: vague ones get a short AI reply asking for specifics; spam/abuse get nothing. Builders see why.
  if (s.status === "filtered") {
    if (isBuilder) return <p data-testid="filtered-note" className="mt-1.5 inline-flex rounded-lg border border-dashed px-2 py-1 text-xs text-muted-foreground">Filtered — not a change request: {s.reason}</p>;
    if (!s.aiReply) return null;
    return (
      <div data-testid="ai-reply" className="mt-2 flex gap-2 rounded-xl border bg-muted/40 p-2.5 text-sm">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="size-3.5" aria-hidden /></span>
        <div><span className="text-xs font-semibold">{COPY.aiName}</span> <span className="text-xs text-muted-foreground">· didn&apos;t become a change request</span><p>{s.aiReply}</p></div>
      </div>
    );
  }

  const idx = STEP_ORDER.indexOf(s.status as (typeof STEP_ORDER)[number]);
  const working = ["queued", "running", "reviewing"].includes(s.status);
  const statusText = isBuilder ? BUILDER_STATUS[s.status] : VIEWER_STATUS[s.status];
  return (
    <div data-testid="suggestion-card" className="mt-2 rounded-xl border border-primary/30 bg-accent/30 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="size-3.5" aria-hidden /></span>
        <span className="font-semibold">{COPY.aiName}</span>
        <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[0.65rem] text-muted-foreground" title={COPY.demoExplainer}>{COPY.demoBadge}</span>
        {s.round > 1 && <span className="rounded-full bg-background px-1.5 py-0.5 text-[0.65rem] font-semibold">Round {s.round}</span>}
        <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", s.status === "merged" || s.status === "pr_opened" ? "bg-success/15 text-success" : "bg-background text-foreground")}>
          {working ? <Loader2 className="size-3 animate-spin" aria-hidden /> : s.status === "pr_opened" || s.status === "merged" ? <Check className="size-3" aria-hidden /> : s.status === "preview_recorded" ? <Film className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
          <span data-testid="suggestion-status">{statusText}</span>
        </span>
      </div>
      <p className="mt-2 text-sm"><span className="text-muted-foreground">{isBuilder ? "Change request:" : "Here's your suggestion as a change:"}</span> <strong>{s.title}</strong></p>
      <p className="mt-0.5 text-sm text-foreground/80">{s.restated}</p>
      {s.status === "confirming" && s.question && <p className="mt-1.5 text-sm"><span aria-hidden>❓ </span>{s.question}</p>}
      {s.status === "confirming" && mine && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="rounded-full" disabled={Boolean(pending)} onClick={() => act("confirm", () => confirmChange(s.id))}>{pending === "confirm" ? <Loader2 className="animate-spin" /> : <Check />} {COPY.confirm}</Button>
        </div>
      )}
      {s.status === "builder_review" && <p className="mt-1.5 text-xs text-muted-foreground">{s.reason}</p>}
      <Gates status={s.status} builder={isBuilder} />
      {idx >= 1 && (
        <ol className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="Progress">
          {STEPS.map((st) => {
            const i = STEP_ORDER.indexOf(st);
            const reached = idx >= i;
            const current = s.status === st;
            return (
              <li key={st} className={cn("flex items-center gap-1 rounded-lg px-1.5 py-1 text-[0.7rem] font-medium", reached ? "bg-primary/15 text-foreground" : "bg-muted/60 text-muted-foreground")}>
                {current && working ? <Loader2 className="size-3 shrink-0 animate-spin" /> : reached ? <Check className="size-3 shrink-0 text-primary" /> : <CircleDashed className="size-3 shrink-0" />}
                <span className="truncate">{STEP_LABEL[st]}</span>
              </li>
            );
          })}
        </ol>
      )}
      {s.previewVideoUrl && !working && <Recording url={s.previewVideoUrl} />}
      {s.status === "preview_recorded" && mine && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-full" disabled={Boolean(pending)} onClick={() => act("approve", () => reviewPreview(s.id, "approve"))}>{pending === "approve" ? <Loader2 className="animate-spin" /> : <Check />} {COPY.looksRight}</Button>
            <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => setRevising(!revising)}>{COPY.notQuite}</Button>
          </div>
          {revising && (
            <div className="flex gap-2">
              <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change? e.g. make it even bigger" aria-label="What should change?" className="min-h-9" />
              <Button size="sm" disabled={Boolean(pending) || note.trim().length < 3} onClick={() => act("revise", () => reviewPreview(s.id, "revise", note))}>{COPY.notQuiteSend}</Button>
            </div>
          )}
        </div>
      )}
      {s.preview && isBuilder && <p className="mt-2 rounded-lg bg-background px-2.5 py-1.5 text-xs"><strong>Agent summary:</strong> {s.preview}</p>}
      {isBuilder && s.events.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-l-2 pl-2.5 text-xs text-muted-foreground">
          {s.events.slice(-3).map((e) => <li key={e.id}><span className="font-semibold text-foreground">{ACTOR[e.actor] ?? e.actor}:</span> {e.message}</li>)}
        </ul>
      )}
      {isBuilder && (s.status === "sent" || s.status === "builder_review") && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full" disabled={Boolean(pending)} onClick={() => act("adopt", () => decideChange(s.id, "adopt"))}>{pending === "adopt" ? <Loader2 className="animate-spin" /> : <GitPullRequest />} {COPY.adopt}</Button>
          <Button size="sm" variant="ghost" className="rounded-full" disabled={Boolean(pending)} onClick={() => act("decline", () => decideChange(s.id, "decline"))}>{COPY.decline}</Button>
        </div>
      )}
      {isBuilder && s.status === "pr_opened" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success"><GitPullRequest className="size-3" /> PR #{s.prNumber} · {repo} · demo, not on GitHub</span>
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => act("merge", () => decideChange(s.id, "merge"))}>{COPY.merge}</Button>
        </div>
      )}
      {!isBuilder && (s.status === "pr_opened" || s.status === "merged") && (
        <p className="mt-2 text-sm font-semibold text-success">🎉 The maker adopted your suggestion{mine ? " — you earned contribution points." : "."}</p>
      )}
    </div>
  );
}
