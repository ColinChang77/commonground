"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitPullRequest, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { decideChange } from "@/server/suggestions";
import { BUILDER_STATUS, COPY } from "@/lib/copy";
import { Button } from "@/components/ui/button";

export type InboxItem = { id: string; title: string; restated: string; status: string; quality: string; reason: string; author: string; previewVideoUrl: string | null; prNumber: number | null };

const QUALITY: Record<string, string> = { actionable: "Actionable", needs_builder: "Needs you", vague: "Too vague", spam: "Spam", abusive: "Abusive", not_a_change: "Not a change" };

export function InboxCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const act = async (key: "adopt" | "decline" | "restore") => {
    setPending(key);
    const res = await decideChange(item.id, key);
    setPending(null);
    if (!res.ok) toast.error(res.error);
    else { toast.success(res.message); router.refresh(); }
  };
  return (
    <article data-testid="inbox-card" className="rounded-lg border bg-background p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-1 text-[0.68rem]">
        <span className={item.status === "filtered" ? "rounded-full bg-muted px-1.5 py-0.5 font-semibold" : "rounded-full bg-primary/15 px-1.5 py-0.5 font-semibold"}>{QUALITY[item.quality] ?? item.quality}</span>
        <span className="text-muted-foreground">by {item.author}</span>
      </div>
      <p className="mt-1 font-medium leading-snug">{item.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.status === "filtered" ? `Why: ${item.reason}` : BUILDER_STATUS[item.status]}</p>
      {item.previewVideoUrl && item.status !== "filtered" && (
        <video src={item.previewVideoUrl} muted loop autoPlay playsInline className="mt-1.5 w-full rounded border bg-black" aria-label="Preview recording" />
      )}
      {(item.status === "sent" || item.status === "builder_review") && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" className="h-7 rounded-full px-2.5 text-xs" disabled={Boolean(pending)} onClick={() => act("adopt")}>{pending === "adopt" ? <Loader2 className="animate-spin" /> : <GitPullRequest />} {COPY.adopt}</Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-xs" disabled={Boolean(pending)} onClick={() => act("decline")}>{COPY.decline}</Button>
        </div>
      )}
      {item.status === "filtered" && (
        <Button size="sm" variant="outline" className="mt-2 h-7 rounded-full px-2.5 text-xs" disabled={Boolean(pending)} onClick={() => act("restore")}>{pending === "restore" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restore</Button>
      )}
      {item.prNumber && <p className="mt-1.5 text-xs font-semibold text-success">PR #{item.prNumber} · demo, not on GitHub</p>}
    </article>
  );
}
