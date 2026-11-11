import Link from "next/link";
import { Check } from "lucide-react";
import type { Step } from "@/server/queries/onboarding";
import { cn } from "@/lib/utils";

export function GettingStarted({ steps, idSuffix = "" }: { steps: Step[]; idSuffix?: string }) {
  const hid = `gs-h${idSuffix}`;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section aria-labelledby={hid} className="rounded-xl border bg-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 id={hid} className="text-sm font-bold">Getting started</h2>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">{done}/{steps.length}</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="flex flex-col gap-0.5">
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={s.href} className={cn("-mx-2 flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted", s.done && "opacity-60")}>
              <span className={cn("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-bold", s.done ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25")}>{s.done ? <Check className="size-3" /> : null}</span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", s.done && "line-through")}>{s.title}</span>
                {!s.done && <span className="block text-xs text-muted-foreground">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <Link href="/guide" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">How CommonGround works →</Link>
    </section>
  );
}
