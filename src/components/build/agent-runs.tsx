"use client";
import { Check, GitBranch, GitPullRequest } from "lucide-react";
import { mergePullRequest, reviewPullRequest } from "@/server/github";
import { decideApproval } from "@/server/agents";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/time-ago";
import { UserAvatar } from "@/components/user-avatar";
import { useAction } from "@/components/use-action";
import { cn } from "@/lib/utils";

export type RunCard = {
  id: string; person: string; avatar: string | null; agent: string; taskTitle: string; taskHref: string | null; status: string; branch: string | null;
  startedAt: number | null; lastMessage: string | null; tests: { passed?: number; failed?: number } | null; files: string[];
  events: { id: string; type: string; message: string; createdAt: number }[];
  approvalId: string | null; canDecide: boolean; isMine: boolean; hasBranch: boolean;
};

const STEPS = [
  { id: "running", label: "Working" },
  { id: "testing", label: "Testing" },
  { id: "review", label: "Team review" },
  { id: "done", label: "Done" },
];
const stepOf = (s: string) => (s === "running" ? 0 : s === "testing" ? 1 : s === "changes_ready" || s === "waiting_approval" || s === "pr_created" ? 2 : s === "completed" ? 3 : -1);
const SENTENCE: Record<string, string> = {
  running: "is building", testing: "is testing", changes_ready: "finished a version of", waiting_approval: "is waiting for review on", pr_created: "shared changes for", completed: "finished", failed: "got stuck on", cancelled: "stopped working on",
};

export function AgentRuns({ runs }: { runs: RunCard[] }) {
  const { exec, pending } = useAction();
  if (!runs.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {runs.map((r) => {
        const step = stepOf(r.status);
        const live = r.status === "running" || r.status === "testing";
        return (
          <li key={r.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="relative"><UserAvatar name={r.person} avatarKey={r.avatar} size={36} /><span className="absolute -bottom-1 -right-1 rounded-full bg-card px-0.5 text-sm" aria-hidden>🤖</span></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug"><strong>{r.person.split(" ")[0]}&apos;s AI agent</strong> <span className="text-muted-foreground">({r.agent})</span> {SENTENCE[r.status] ?? "is working on"} <strong>{r.taskTitle}</strong></p>
                {r.lastMessage && <p className="mt-0.5 text-sm text-muted-foreground">“{r.lastMessage}”</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {live && <span className="inline-flex items-center gap-1 font-semibold text-success"><span className="size-1.5 animate-pulse rounded-full bg-success motion-reduce:animate-none" /> Live</span>}
                  {r.startedAt && <span>started <TimeAgo date={r.startedAt} /></span>}
                  {r.tests && (r.tests.passed !== undefined || r.tests.failed !== undefined) && <span className={cn("rounded-full px-2 py-0.5 font-semibold", r.tests.failed ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success")}>{r.tests.failed ? `${r.tests.failed} tests failing` : `${r.tests.passed} tests passing`}</span>}
                  {r.status === "failed" && <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">Needs help</span>}
                </div>
              </div>
            </div>
            {r.approvalId && r.canDecide && (
              <div className="mt-3 rounded-lg border border-primary/40 bg-accent/40 p-3">
                <p className="text-sm font-semibold">{r.isMine ? "👀 Your agent finished. Check its work, then share it with the team." : "👀 This agent's work is waiting for a review."}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-full" disabled={pending} onClick={() => exec(() => decideApproval(r.approvalId!, "approved"))}>{r.hasBranch ? "Looks good — open for team review" : "Looks good — send to the team"}</Button>
                  <Button size="sm" variant="ghost" className="rounded-full" disabled={pending} onClick={() => exec(() => decideApproval(r.approvalId!, "rejected"))}>Not yet</Button>
                </div>
              </div>
            )}
            {step >= 0 && (
              <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Progress">
                {STEPS.map((s, i) => (
                  <li key={s.id} className="flex flex-col gap-1">
                    <span className={cn("h-1.5 rounded-full", i < step || (i === step && r.status === "completed") ? "bg-primary" : i === step ? "animate-pulse bg-primary/60 motion-reduce:animate-none" : "bg-muted")} />
                    <span className={cn("text-[0.7rem]", i <= step ? "font-semibold" : "text-muted-foreground")}>{s.label}</span>
                  </li>
                ))}
              </ol>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Details for developers</summary>
              <div className="mt-2 flex flex-col gap-2">
                {r.branch && <p className="flex items-center gap-1.5 text-xs"><GitBranch className="size-3.5" /> <code className="rounded bg-muted px-1">{r.branch}</code></p>}
                {r.files.length > 0 && <div><p className="text-xs font-semibold">Files changed ({r.files.length})</p><ul className="mt-1 max-h-32 overflow-auto font-mono text-xs text-muted-foreground">{r.files.map((f) => <li key={f}>{f}</li>)}</ul></div>}
                <div><p className="text-xs font-semibold">Agent log</p><ol className="mt-1 max-h-48 overflow-auto font-mono text-xs">{r.events.map((e) => <li key={e.id} className="flex gap-2"><span className="shrink-0 text-muted-foreground"><TimeAgo date={e.createdAt} /></span><span className={e.type === "error" ? "text-destructive" : ""}>{e.message}</span></li>)}</ol></div>
                {r.taskHref && <a href={r.taskHref} className="text-xs font-semibold text-primary hover:underline">Open the to-do</a>}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export type PrCard = { id: string; number: number; title: string; url: string; state: string; canReview: boolean; author: string | null };

export function PullRequestReview({ prs }: { prs: PrCard[] }) {
  const { exec, pending } = useAction();
  if (!prs.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {prs.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3.5">
          <GitPullRequest className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{p.title}</span><span className="text-xs text-muted-foreground">Changes ready for review{p.author ? ` · from ${p.author}` : ""} · <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">see the changes on GitHub</a></span></span>
          {p.canReview && (
            <span className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => exec(() => reviewPullRequest(p.id, "APPROVE"))}><Check /> Approve</Button>
              <Button size="sm" className="rounded-full" disabled={pending} onClick={() => exec(() => mergePullRequest(p.id))}>Merge</Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
