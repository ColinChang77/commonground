"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { applyToOpportunity, createOpportunity, reviewApplication, setOpportunityStatus, withdrawApplication } from "@/server/collab";
import { COMPENSATION } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { TagInput } from "@/components/tag-input";
import { UserAvatar } from "@/components/user-avatar";
import { TimeAgo } from "@/components/time-ago";
import { useAction } from "@/components/use-action";

export function NewOpportunity({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { exec, pending } = useAction();
  const [f, setF] = useState({ title: "", description: "", deliverable: "", commitment: "", compensation: "volunteer", deadline: "", skills: [] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f, v: string | string[]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New opportunity</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New opportunity</DialogTitle>
            <DialogDescription>Describe a role so the right person can say “that&apos;s me”.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="Title" htmlFor="o-title" error={errors.title}><Input id="o-title" value={f.title} maxLength={100} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Illustrator for launch poster" /></Field>
            <Field label="Description" htmlFor="o-desc" error={errors.description}><Textarea id="o-desc" rows={4} value={f.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="Expected deliverable" htmlFor="o-deliv" optional><Input id="o-deliv" value={f.deliverable} maxLength={1000} onChange={(e) => set("deliverable", e.target.value)} placeholder="e.g. A print-ready A2 poster" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated commitment" htmlFor="o-commit" optional><Input id="o-commit" value={f.commitment} maxLength={100} onChange={(e) => set("commitment", e.target.value)} placeholder="e.g. ~5 hrs over 2 weeks" /></Field>
              <Field label="Compensation" htmlFor="o-comp">
                <Select value={f.compensation} onValueChange={(v) => set("compensation", v)}>
                  <SelectTrigger id="o-comp" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{COMPENSATION.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Application deadline" htmlFor="o-deadline" optional><Input id="o-deadline" type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
            <Field label="Skills" htmlFor="o-skills" optional><TagInput id="o-skills" value={f.skills} onChange={(v) => set("skills", v)} max={10} placeholder="Press Enter after each" /></Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={pending}
              onClick={async () => {
                const r = await exec(() => createOpportunity({ projectId, ...f, deadline: f.deadline || undefined }));
                if (r.ok) {
                  setOpen(false);
                  setF({ title: "", description: "", deliverable: "", commitment: "", compensation: "volunteer", deadline: "", skills: [] });
                } else setErrors(r.fieldErrors ?? {});
              }}
            >
              {pending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ApplyButton({ opportunityId, title, state, applicationId, signedIn, signInHref }: { opportunityId: string; title: string; state: "none" | "pending" | "accepted" | "rejected" | "withdrawn" | "member" | "closed"; applicationId?: string; signedIn: boolean; signInHref: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { exec, pending } = useAction();
  if (state === "member") return <span className="text-sm text-muted-foreground">You&apos;re on the team</span>;
  if (state === "accepted") return <span className="text-sm font-medium text-success">Accepted</span>;
  if (state === "closed") return <span className="text-sm text-muted-foreground">Closed</span>;
  if (state === "pending")
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Application pending</span>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => withdrawApplication(applicationId!))}>Withdraw</Button>
      </div>
    );
  if (!signedIn) return <Button asChild size="sm"><Link href={signInHref}>Sign in to apply</Link></Button>;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{state === "rejected" || state === "withdrawn" ? "Apply again" : "Apply"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply: {title}</DialogTitle>
            <DialogDescription>Say why you&apos;re interested and what you&apos;d bring. The project team will see your profile too.</DialogDescription>
          </DialogHeader>
          <Textarea rows={6} value={message} maxLength={3000} onChange={(e) => setMessage(e.target.value)} aria-label="Application message" placeholder="Hi! I'd love to help with this because…" />
          <p className="text-xs text-muted-foreground">{message.trim().length < 20 ? `At least ${20 - message.trim().length} more characters` : `${message.length}/3000`}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || message.trim().length < 20} onClick={async () => { const r = await exec(() => applyToOpportunity({ opportunityId, message })); if (r.ok) setOpen(false); }}>{pending ? "Sending…" : "Send application"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type ApplicantRow = { id: string; message: string; status: string; createdAt: number; username: string; displayName: string; avatarKey: string | null; bio: string };

export function Applicants({ rows }: { rows: ApplicantRow[] }) {
  const { exec, pending } = useAction();
  const pendingRows = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");
  if (!rows.length) return <p className="text-sm text-muted-foreground">No applications yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {pendingRows.map((a) => (
        <div key={a.id} className="rounded-xl border bg-background p-3">
          <div className="flex items-center gap-2.5">
            <UserAvatar name={a.displayName} avatarKey={a.avatarKey} size={32} />
            <div className="min-w-0 flex-1 leading-tight">
              <Link href={`/u/${a.username}`} className="text-sm font-medium hover:underline">{a.displayName}</Link>
              <div className="text-xs text-muted-foreground">@{a.username} · applied <TimeAgo date={a.createdAt} /></div>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm">{a.message}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => exec(() => reviewApplication(a.id, "accepted"))}>Accept</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => reviewApplication(a.id, "rejected"))}>Decline</Button>
          </div>
        </div>
      ))}
      {decided.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {decided.map((a) => <li key={a.id}><Link href={`/u/${a.username}`} className="hover:underline">{a.displayName}</Link> — {a.status}</li>)}
        </ul>
      )}
    </div>
  );
}

export function OpportunityStatusControl({ id, status }: { id: string; status: string }) {
  const { exec, pending } = useAction();
  return status === "open" ? (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => setOpportunityStatus(id, "filled"))}>Mark filled</Button>
  ) : (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => setOpportunityStatus(id, "open"))}>Reopen</Button>
  );
}
