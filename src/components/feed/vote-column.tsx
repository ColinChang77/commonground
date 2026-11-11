"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { toast } from "sonner";
import { vote } from "@/server/discussions";
import { cn } from "@/lib/utils";

export function VoteColumn({ id, score, myVote, signedIn, horizontal = false }: { id: string; score: number; myVote: number | null; signedIn: boolean; horizontal?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState({ score, my: myVote ?? 0 });
  // Requests are chained so rapid clicks reach the server in order; each sends the absolute target.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(0);
  const cast = (value: 1 | -1) => {
    if (!signedIn) return router.push(`/sign-in?next=${encodeURIComponent(`/d/${id}`)}`);
    const prev = state;
    const nextMy = (prev.my === value ? 0 : value) as 1 | -1 | 0;
    setState({ my: nextMy, score: prev.score - prev.my + nextMy });
    const seq = ++latest.current;
    queue.current = queue.current.then(async () => {
      const res = await vote(id, nextMy);
      if (seq !== latest.current) return; // a newer click supersedes this response
      if (!res.ok) {
        setState(prev);
        toast.error(res.error);
      } else setState({ score: res.data.score, my: res.data.myVote });
    });
  };
  return (
    <div className={cn("flex items-center", horizontal ? "flex-row gap-0.5 rounded-full bg-muted/70 px-1" : "flex-col gap-0.5")}>
      <button type="button" aria-label="Upvote" aria-pressed={state.my === 1} onClick={() => cast(1)} className={cn("inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-primary/10 hover:text-primary", state.my === 1 ? "text-primary" : "text-muted-foreground")}>
        <ArrowBigUp className={cn("size-6", state.my === 1 && "fill-current")} />
      </button>
      <span className={cn("min-w-6 text-center text-sm font-bold tabular-nums", state.my === 1 && "text-primary", state.my === -1 && "text-info")} aria-label={`Score ${state.score}`}>{state.score}</span>
      <button type="button" aria-label="Downvote" aria-pressed={state.my === -1} onClick={() => cast(-1)} className={cn("inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-info/10 hover:text-info", state.my === -1 ? "text-info" : "text-muted-foreground")}>
        <ArrowBigDown className={cn("size-6", state.my === -1 && "fill-current")} />
      </button>
    </div>
  );
}
