"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { createTask, reviewSubmission, submitTaskWork, updateTask } from "@/server/tasks";
import { AUTHORSHIP, CONTRIBUTION_TYPES, TASK_STATUSES, TASK_STATUS_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { useAction } from "@/components/use-action";

type Member = { userId: string; displayName: string; role: string };

export function NewTask({ projectId, members, canAssign, viewerId, isSoftware }: { projectId: string; members: Member[]; canAssign: boolean; viewerId: string; isSoftware: boolean }) {
  const [open, setOpen] = useState(false);
  const { exec, pending } = useAction();
  const blank = { title: "", description: "", deliverable: "", contributionType: isSoftware ? "code" : "research", isCoding: isSoftware, assigneeId: "", dueAt: "" };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const assignable = members.filter((m) => m.role !== "viewer" && (canAssign || m.userId === viewerId));
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New task</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>New task</DialogTitle><DialogDescription>A clear task with a concrete deliverable is easier to pick up.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="Title" htmlFor="t-title" error={errors.title}><Input id="t-title" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Description" htmlFor="t-desc" optional><Textarea id="t-desc" rows={4} value={f.description} maxLength={10000} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Deliverable" htmlFor="t-deliv" optional><Input id="t-deliv" value={f.deliverable} maxLength={1000} onChange={(e) => setF({ ...f, deliverable: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type of work" htmlFor="t-type">
                <Select value={f.contributionType} onValueChange={(v) => setF({ ...f, contributionType: v })}>
                  <SelectTrigger id="t-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRIBUTION_TYPES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Assignee" htmlFor="t-assignee" optional>
                <Select value={f.assigneeId || "none"} onValueChange={(v) => setF({ ...f, assigneeId: v === "none" ? "" : v })}>
                  <SelectTrigger id="t-assignee" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {assignable.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.userId === viewerId ? `${m.displayName} (me)` : m.displayName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Due date" htmlFor="t-due" optional><Input id="t-due" type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
            {isSoftware && <label className="flex items-center justify-between gap-3 text-sm"><span>Coding task <span className="block text-xs text-muted-foreground">Can be synced to a GitHub Issue and handed to an AI agent.</span></span><Switch checked={f.isCoding} onCheckedChange={(v) => setF({ ...f, isCoding: v })} aria-label="Coding task" /></label>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || f.title.trim().length < 3} onClick={async () => {
              const r = await exec(() => createTask({ projectId, ...f, assigneeId: f.assigneeId || null, dueAt: f.dueAt || undefined }));
              if (r.ok) { setOpen(false); setF(blank); } else setErrors(r.fieldErrors ?? {});
            }}>{pending ? "Creating…" : "Create task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TaskControls({ taskId, status, assigneeId, viewerId, manager, members }: { taskId: string; status: string; assigneeId: string | null; viewerId: string; manager: boolean; members: Member[] }) {
  const { exec, pending } = useAction();
  const mine = assigneeId === viewerId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!assigneeId && <Button size="sm" className="rounded-full" disabled={pending} onClick={() => exec(() => updateTask({ taskId, assigneeId: viewerId, status: status === "todo" ? "in_progress" : undefined }), { success: "It's yours — thanks!" })}>I&apos;ll do this</Button>}
      {mine && status !== "done" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => updateTask({ taskId, assigneeId: null }))}>Give it back</Button>}
      {(manager || mine) && (
        <Select value={status} onValueChange={(v) => exec(() => updateTask({ taskId, status: v }))}>
          <SelectTrigger size="sm" aria-label="Status" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{TASK_STATUSES.filter((s) => manager || s !== "done").map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {manager && (
        <Select value={assigneeId ?? "none"} onValueChange={(v) => exec(() => updateTask({ taskId, assigneeId: v === "none" ? null : v }))}>
          <SelectTrigger size="sm" aria-label="Assignee" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {members.filter((m) => m.role !== "viewer").map((m) => <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function SubmitWork({ taskId }: { taskId: string }) {
  const { exec, pending } = useAction();
  const [summary, setSummary] = useState("");
  const [link, setLink] = useState("");
  const [authorship, setAuthorship] = useState("human");
  const [agentLabel, setAgentLabel] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold">Submit your work for review</h3>
      <Textarea rows={4} aria-label="What did you do?" placeholder="What did you do? What should reviewers look at?" value={summary} maxLength={5000} onChange={(e) => setSummary(e.target.value)} />
      <Input aria-label="Link to the deliverable" placeholder="Link to the deliverable (Drive, Figma, GitHub PR…)" value={link} onChange={(e) => setLink(e.target.value)} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm">How was this made?</legend>
        <div className="flex flex-wrap gap-2">
          {AUTHORSHIP.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
              <input type="radio" name={`auth-${taskId}`} checked={authorship === a.id} onChange={() => setAuthorship(a.id)} className="accent-[var(--primary)]" /> {a.label}
            </label>
          ))}
        </div>
      </fieldset>
      {authorship !== "human" && <Input aria-label="AI tool used" placeholder="Which AI tool? e.g. Claude Code, Codex" value={agentLabel} maxLength={60} onChange={(e) => setAgentLabel(e.target.value)} />}
      <Button className="self-end" disabled={pending || summary.trim().length < 10} onClick={async () => { const r = await exec(() => submitTaskWork({ taskId, summary, link, authorship, agentLabel: agentLabel || undefined })); if (r.ok) { setSummary(""); setLink(""); } }}>{pending ? "Submitting…" : "Submit for review"}</Button>
    </div>
  );
}

export function ReviewSubmission({ submissionId }: { submissionId: string }) {
  const { exec, pending } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Textarea rows={2} aria-label="Review note" placeholder="Note for the contributor (required when requesting changes)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => exec(() => reviewSubmission(submissionId, "approve", note))}>Approve &amp; verify</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => reviewSubmission(submissionId, "changes", note))}>Request changes</Button>
      </div>
    </div>
  );
}
