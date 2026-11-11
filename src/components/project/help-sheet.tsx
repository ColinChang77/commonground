"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hand, MessageCircle, Users, Wrench } from "lucide-react";
import { joinProject, takeTask } from "@/server/projects";
import { compensationLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction } from "@/components/use-action";

export type HelpData = {
  slug: string; projectId: string; title: string; openJoin: boolean; signedIn: boolean;
  roles: { id: string; title: string; commitment: string; compensation: string; skills: string[] }[];
  todos: { id: string; title: string; type: string }[];
};

export function HelpButton({ data, label = "I'd like to help", variant = "default" }: { data: HelpData; label?: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { exec, pending } = useAction();
  const signIn = () => router.push(`/sign-in?next=/p/${data.slug}`);
  const take = async (id: string) => { const r = await exec(() => takeTask(id)); if (r.ok) { setOpen(false); router.push(`/p/${data.slug}/tasks/${id}`); } };
  const join = async () => { const r = await exec(() => joinProject(data.projectId)); if (r.ok) setOpen(false); };
  return (
    <>
      <Button size="lg" variant={variant} className="rounded-full px-5" onClick={() => (data.signedIn ? setOpen(true) : signIn())}><Hand /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>How you can help with {data.title}</DialogTitle>
            <DialogDescription>Pick whatever fits — big or small. You can always do more later.</DialogDescription>
          </DialogHeader>

          <section className="rounded-xl border p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="size-4 text-primary" /> Just chip in</h3>
            <p className="mt-1 text-sm text-muted-foreground">Share an idea, give feedback or ask a question in the conversation. No commitment.</p>
            <Button asChild variant="outline" size="sm" className="mt-2 rounded-full"><Link href={`/p/${data.slug}/discussion`} onClick={() => setOpen(false)}>Join the conversation</Link></Button>
          </section>

          <section className="rounded-xl border p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Wrench className="size-4 text-primary" /> Take one thing</h3>
            <p className="mt-1 text-sm text-muted-foreground">Pick a to-do and it&apos;s yours. When you&apos;re done, share what you made and the team approves it — it shows up on your profile.</p>
            {data.todos.length ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {data.todos.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                    <span className="min-w-0 text-sm font-medium">{t.title}</span>
                    {data.openJoin ? <Button size="sm" className="shrink-0 rounded-full" disabled={pending} onClick={() => take(t.id)}>I&apos;ll do this</Button> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted-foreground">Nothing open right now.</p>}
            {!data.openJoin && data.todos.length > 0 && <p className="mt-2 text-xs text-muted-foreground">This team reviews new helpers first — apply to a role below.</p>}
          </section>

          <section className="rounded-xl border p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Users className="size-4 text-primary" /> Join the team</h3>
            <p className="mt-1 text-sm text-muted-foreground">Become a regular collaborator: see everything, pick up to-dos anytime, and get credit for your work.</p>
            {data.roles.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {data.roles.map((r) => (
                  <li key={r.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <span className="font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{[r.commitment, compensationLabel(r.compensation), r.skills.join(", ")].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {data.openJoin && <Button size="sm" className="rounded-full" disabled={pending} onClick={join}>Join now</Button>}
              {data.roles.length > 0 && <Button asChild size="sm" variant="outline" className="rounded-full"><Link href={`/p/${data.slug}/opportunities`} onClick={() => setOpen(false)}>Apply for a role</Link></Button>}
            </div>
          </section>
          <p className="text-xs text-muted-foreground">What happens next: the team gets a notification and sees you in the project. You&apos;ll get updates when something changes.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TakeTaskButton({ taskId, slug }: { taskId: string; slug: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  return <Button size="sm" variant="outline" className="shrink-0 rounded-full" disabled={pending} onClick={async () => { const r = await exec(() => takeTask(taskId)); if (r.ok) router.push(`/p/${slug}/tasks/${taskId}`); }}>I&apos;ll do this</Button>;
}
