"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { cancelBuildRequest, respondToBuild } from "@/server/build-requests";
import { BUILD_KINDS, BUILD_STAGES, type BuildStage } from "@/lib/build-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TimeAgo } from "@/components/time-ago";
import { useAction } from "@/components/use-action";
import { cn } from "@/lib/utils";

export type BuildCardData = {
  id: string; title: string; description: string; kind: string; builder: "community" | "team"; stage: BuildStage; createdAt: number;
  builderName: string | null; previewUrl: string | null; liveUrl: string | null; note: string | null; taskHref: string | null; canRespond: boolean; canCancel: boolean;
};

export function Stepper({ stage }: { stage: BuildStage }) {
  const idx = BUILD_STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="flex items-start" aria-label="Progress">
      {BUILD_STAGES.map((s, i) => {
        const done = i < idx || stage === "live";
        const current = i === idx && stage !== "live";
        return (
          <li key={s.id} className="flex flex-1 flex-col items-center text-center" aria-current={current ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= idx ? "bg-primary" : "bg-border")} />
              <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold", done ? "border-primary bg-primary text-primary-foreground" : current ? "border-primary bg-background text-primary" : "border-border bg-background text-muted-foreground")}>
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === BUILD_STAGES.length - 1 ? "bg-transparent" : i < idx ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("mt-1.5 text-xs font-semibold", current ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground")}>{s.label}</span>
            <span className="hidden text-[0.68rem] text-muted-foreground sm:block">{s.hint}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function BuildRequestCard({ r }: { r: BuildCardData }) {
  const { exec, pending } = useAction();
  const [changes, setChanges] = useState(false);
  const [note, setNote] = useState("");
  const kind = BUILD_KINDS.find((k) => k.id === r.kind) ?? BUILD_KINDS[BUILD_KINDS.length - 1];
  return (
    <article className="rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold"><span aria-hidden>{kind.emoji}</span> {r.title}</h3>
          <p className="text-xs text-muted-foreground">
            {r.builder === "team" ? "🤝 Built by the CommonGround team" : r.builderName ? `🙋 Built by ${r.builderName}` : "🙋 Built by a community volunteer"} · asked <TimeAgo date={r.createdAt} />
          </p>
        </div>
        {r.stage === "cancelled" && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">Cancelled</span>}
      </div>
      {r.stage !== "cancelled" && <div className="mt-4"><Stepper stage={r.stage} /></div>}

      {r.stage === "requested" && r.builder === "community" && (
        <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-sm">Waiting for a volunteer. It&apos;s listed under <strong>Help wanted</strong> — you&apos;ll get a notification when someone offers to help.</p>
      )}
      {r.stage === "requested" && r.builder === "team" && <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-sm">Our team got your request and will start soon.</p>}
      {r.stage === "building" && <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-sm">⏳ {r.builderName ?? "Someone"} is working on it.{r.note ? ` Latest note: “${r.note}”` : ""}</p>}

      {r.stage === "review" && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-accent/40 p-3">
          <p className="text-sm font-semibold">👀 It&apos;s ready — take a look and tell us if it&apos;s right.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.previewUrl && <Button asChild variant="outline" size="sm" className="rounded-full"><a href={r.previewUrl} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink /> Open preview</a></Button>}
            {r.builder === "team" && r.canRespond && !changes && (
              <>
                <Button size="sm" className="rounded-full" disabled={pending} onClick={() => exec(() => respondToBuild(r.id, "approve"))}>Looks good — approve</Button>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setChanges(true)}>Ask for changes</Button>
              </>
            )}
            {r.builder === "community" && r.taskHref && r.canRespond && <Button asChild size="sm" className="rounded-full"><Link href={r.taskHref}>Review &amp; approve</Link></Button>}
          </div>
          {changes && (
            <div className="mt-3 flex flex-col gap-2">
              <Textarea aria-label="What should change?" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change? e.g. Make the button bigger and add our opening hours." />
              <div className="flex gap-2">
                <Button size="sm" className="rounded-full" disabled={pending || !note.trim()} onClick={async () => { const res = await exec(() => respondToBuild(r.id, "changes", note)); if (res.ok) setChanges(false); }}>Send notes</Button>
                <Button size="sm" variant="ghost" onClick={() => setChanges(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {r.stage === "live" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm">
          🎉 <strong>It&apos;s live!</strong>
          {(r.liveUrl ?? r.previewUrl) && <a href={(r.liveUrl ?? r.previewUrl)!} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><ExternalLink className="size-3.5" /> Open it</a>}
        </div>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">What you asked for</summary>
        <p className="mt-1 whitespace-pre-line text-foreground/80">{r.description}</p>
        {r.canCancel && r.stage !== "live" && r.stage !== "cancelled" && <button type="button" disabled={pending} onClick={() => exec(() => cancelBuildRequest(r.id))} className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline">Cancel this request</button>}
      </details>
    </article>
  );
}
