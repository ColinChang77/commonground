"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { deleteProject, removeMember, transferOwnership, updateProject } from "@/server/projects";
import { CATEGORIES, PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormError } from "@/components/form-field";
import { TagInput } from "@/components/tag-input";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useAction } from "@/components/use-action";

type P = { id: string; title: string; summary: string; description: string; goals: string[]; outcomes: string; category: string; status: string; visibility: string; isSoftware: boolean; openJoin: boolean; tags: string[]; links: { label: string; url: string }[] };

export function ProjectSettingsForm({ p, isOwner, members, viewerId }: { p: P; isOwner: boolean; members: { userId: string; displayName: string }[]; viewerId: string }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [f, setF] = useState(p);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const set = <K extends keyof P>(k: K, v: P[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <FormError message={error} />
        <Field label="Name" htmlFor="s-title" error={errors.title}><Input id="s-title" value={f.title} maxLength={100} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Summary" htmlFor="s-summary" error={errors.summary}><Textarea id="s-summary" rows={2} value={f.summary} maxLength={280} onChange={(e) => set("summary", e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="s-status">
            <Select value={f.status} onValueChange={(v) => set("status", v)}><SelectTrigger id="s-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select>
          </Field>
          <Field label="Category" htmlFor="s-cat">
            <Select value={f.category} onValueChange={(v) => set("category", v)}><SelectTrigger id="s-cat" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select>
          </Field>
          <Field label="Visibility" htmlFor="s-vis">
            <Select value={f.visibility} onValueChange={(v) => set("visibility", v)}><SelectTrigger id="s-vis" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select>
          </Field>
        </div>
        <Field label="Goals" htmlFor="s-goal-0" error={errors.goals}>
          <div className="flex flex-col gap-2">
            {f.goals.map((g, i) => (
              <div key={i} className="flex gap-2">
                <Input id={`s-goal-${i}`} value={g} maxLength={200} onChange={(e) => set("goals", f.goals.map((x, j) => (j === i ? e.target.value : x)))} />
                {f.goals.length > 1 && <Button variant="ghost" size="icon" aria-label="Remove goal" onClick={() => set("goals", f.goals.filter((_, j) => j !== i))}><Trash2 /></Button>}
              </div>
            ))}
            {f.goals.length < 8 && <Button variant="ghost" size="sm" className="self-start" onClick={() => set("goals", [...f.goals, ""])}><Plus /> Add goal</Button>}
          </div>
        </Field>
        <Field label="Outcomes" htmlFor="s-out" optional><Textarea id="s-out" rows={3} value={f.outcomes} maxLength={2000} onChange={(e) => set("outcomes", e.target.value)} /></Field>
        <Field label="Description" htmlFor="s-desc" optional><MarkdownEditor id="s-desc" value={f.description} onChange={(v) => set("description", v)} rows={6} /></Field>
        <Field label="Tags" htmlFor="s-tags" optional><TagInput id="s-tags" value={f.tags} max={10} onChange={(v) => set("tags", v)} /></Field>
        <Field label="Links" htmlFor="s-link-0" optional error={Object.entries(errors).find(([k]) => k.startsWith("links"))?.[1]}>
          <div className="flex flex-col gap-2">
            {f.links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Link label" placeholder="Label" className="w-36" value={l.label} onChange={(e) => set("links", f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input id={`s-link-${i}`} aria-label="URL" placeholder="https://" value={l.url} onChange={(e) => set("links", f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => set("links", f.links.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            {f.links.length < 8 && <Button variant="ghost" size="sm" className="self-start" onClick={() => set("links", [...f.links, { label: "", url: "" }])}><Plus /> Add link</Button>}
          </div>
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span>Anyone can join in one click<span className="block text-xs text-muted-foreground">On: people join and pick up to-dos right away. Off: they apply and you approve.</span></span><Switch checked={f.openJoin} onCheckedChange={(v) => set("openJoin", v)} aria-label="Open joining" /></label>
        <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span>Software project <span className="block text-xs text-muted-foreground">Shows the Build workspace (GitHub, AI agents, deployments).</span></span><Switch checked={f.isSoftware} onCheckedChange={(v) => set("isSoftware", v)} aria-label="Software project" /></label>
        <div>
          <Button disabled={pending} onClick={async () => {
            const r = await exec(() => updateProject({ projectId: p.id, ...f, goals: f.goals.map((g) => g.trim()).filter(Boolean), links: f.links.filter((l) => l.label || l.url) }));
            if (!r.ok) { setErrors(r.fieldErrors ?? {}); setError(r.error); } else { setErrors({}); setError(null); }
          }}>{pending ? "Saving…" : "Save changes"}</Button>
        </div>
      </section>

      {isOwner ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-destructive/30 p-4">
          <h2 className="text-base font-semibold">Ownership &amp; danger zone</h2>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Transfer ownership to" htmlFor="s-owner" className="min-w-52 flex-1">
              <Select value={newOwner} onValueChange={setNewOwner}><SelectTrigger id="s-owner" className="w-full"><SelectValue placeholder="Choose a member" /></SelectTrigger><SelectContent>{members.filter((m) => m.userId !== viewerId).map((m) => <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>)}</SelectContent></Select>
            </Field>
            <Button variant="outline" disabled={!newOwner || pending} onClick={() => exec(() => transferOwnership(p.id, newOwner))}>Transfer</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <Field label={`Type “${p.title}” to delete this project permanently`} htmlFor="s-del" className="min-w-52 flex-1"><Input id="s-del" value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} /></Field>
            <Button variant="destructive" disabled={confirmTitle !== p.title || pending} onClick={async () => { const r = await exec(() => deleteProject(p.id, confirmTitle), { refresh: false }); if (r.ok) router.push("/"); }}>Delete project</Button>
          </div>
          <p className="text-xs text-muted-foreground">Prefer archiving (Status → Archived): it keeps contributors&apos; verified work visible.</p>
        </section>
      ) : (
        <section className="rounded-2xl border p-4">
          <Button variant="outline" onClick={async () => { const r = await exec(() => removeMember(p.id, viewerId), { refresh: false }); if (r.ok) router.push("/"); }}>Leave project</Button>
        </section>
      )}
    </div>
  );
}
