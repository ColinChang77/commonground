"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, CircleDashed, GitPullRequest, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { confirmChange, decideChange } from "@/server/suggestions";
import { BUILDER_STATUS, COPY, STEP_ORDER, VIEWER_STATUS } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SuggestionView = {
  id: string; authorId: string; title: string; restated: string; question: string | null; status: string; preview: string | null; prNumber: number | null; risk: string;
  events: { id: string; actor: string; message: string }[];
};

const VIEWER_STEPS = ["queued", "running", "reviewing", "preview_ready", "sent", "pr_opened"] as const;
const STEP_LABEL: Record<string, string> = { queued: "Received", running: "Making the change", reviewing: "Double-checking", preview_ready: "Preview ready", sent: "Sent to the maker", pr_opened: "Adopted" };
const ACTOR: Record<string, string> = { triage: "Triage agent", coding: "Coding agent", review: "Review agent", system: "CommonGround", viewer: "Commenter", builder: "Maker" };

export function SuggestionCard({ s, viewerId, isBuilder, repo }: { s: SuggestionView; viewerId: string | null; isBuilder: boolean; repo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const mine = viewerId === s.authorId;
  const idx = STEP_ORDER.indexOf(s.status as (typeof STEP_ORDER)[number]);
  const working = ["queued", "running", "reviewing"].includes(s.status);
  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setPending(key);
    const res = await fn();
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Something went wrong.");
    else { if (res.message) toast.success(res.message); router.refresh(); }
  };
  const statusText = isBuilder ? BUILDER_STATUS[s.status] : VIEWER_STATUS[s.status];
  return (
    <div data-testid="suggestion-card" className="mt-2 rounded-xl border border-primary/30 bg-accent/30 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="size-3.5" aria-hidden /></span>
        <span className="font-semibold">{COPY.aiName}</span>
        <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[0.65rem] text-muted-foreground" title={COPY.demoExplainer}>{COPY.demoBadge}</span>
        <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", s.status === "merged" || s.status === "pr_opened" ? "bg-success/15 text-success" : "bg-background text-foreground")}>
          {working ? <Loader2 className="size-3 animate-spin" aria-hidden /> : s.status === "pr_opened" || s.status === "merged" ? <Check className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
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
      {idx >= 1 && (
        <ol className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="Progress">
          {VIEWER_STEPS.map((st) => {
            const i = STEP_ORDER.indexOf(st);
            const reached = idx >= i || (st === "sent" && s.status === "builder_review");
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
      {s.preview && <p className="mt-2 rounded-lg bg-background px-2.5 py-1.5 text-xs"><strong>Preview:</strong> {isBuilder ? s.preview : s.preview.replace(/\. \d+ files? changed.*$/, ".")}</p>}
      {isBuilder && s.events.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-l-2 pl-2.5 text-xs text-muted-foreground">
          {s.events.slice(-4).map((e) => <li key={e.id}><span className="font-semibold text-foreground">{ACTOR[e.actor] ?? e.actor}:</span> {e.message}</li>)}
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
