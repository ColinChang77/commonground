"use client";
import { useState } from "react";
import { createBuildRequest } from "@/server/build-requests";
import { BUILD_KINDS } from "@/lib/build-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { cn } from "@/lib/utils";

export function BuildRequestForm({ projectId }: { projectId: string }) {
  const { exec, pending } = useAction();
  const [kind, setKind] = useState<(typeof BUILD_KINDS)[number]["id"]>("other");
  const [description, setDescription] = useState("");
  const [builder, setBuilder] = useState<"community" | "team">("community");
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-labelledby="req-h" className="rounded-xl border bg-card p-4 md:p-6">
      <h2 id="req-h" className="text-xl font-bold">What do you want built?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Describe it like you&apos;d explain it to a friend. No technical words needed.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Type of page">
        {BUILD_KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id}
            onClick={() => { setKind(k.id); if (k.example && (!description || BUILD_KINDS.some((x) => x.example === description))) setDescription(k.example); }}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", kind === k.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/40")}>
            <span aria-hidden>{k.emoji}</span> {k.label}
          </button>
        ))}
      </div>
      <Textarea aria-label="Describe what you want" className="mt-3 min-h-28 text-base" maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. A page where neighbors can see which tools are available and reserve one for the weekend." />
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-semibold">Who should build it?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { id: "community", emoji: "🙋", title: "A volunteer from the community", body: "We post it in Help wanted. A developer offers to help, and you approve the result. Free." },
            { id: "team", emoji: "🤝", title: "The CommonGround team builds it", body: "We handle everything and send you a link to check. You just approve." },
          ] as const).map((o) => (
            <label key={o.id} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors", builder === o.id ? "border-primary bg-accent/50 ring-2 ring-primary/20" : "hover:border-foreground/30")}>
              <input type="radio" name="builder" className="sr-only" checked={builder === o.id} onChange={() => setBuilder(o.id)} />
              <span className="text-2xl" aria-hidden>{o.emoji}</span>
              <span><span className="block text-sm font-semibold">{o.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{o.body}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 flex justify-end">
        <Button size="lg" className="rounded-full px-6" disabled={pending || description.trim().length < 15} onClick={async () => {
          setError(null);
          const r = await exec(() => createBuildRequest({ projectId, description, kind, builder, title: "" }));
          if (r.ok) setDescription(""); else setError(r.fieldErrors?.description ?? null);
        }}>{pending ? "Sending…" : "Send request →"}</Button>
      </div>
    </section>
  );
}
