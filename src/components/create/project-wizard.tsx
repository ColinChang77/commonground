"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Code2, Globe2, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createProject } from "@/server/projects";
import { CATEGORIES, categoryLabel, type CategoryId } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, FormError } from "@/components/form-field";
import { TagInput } from "@/components/tag-input";
import { MarkdownEditor } from "@/components/markdown-editor";
import { cn } from "@/lib/utils";

export type WizardSeed = {
  sourceDiscussionId?: string;
  sourceTitle?: string;
  title?: string;
  description?: string;
  category?: CategoryId;
  participantCount?: number;
};

type Role = { title: string; skills: string[] };

export function ProjectWizard({ seed }: { seed?: WizardSeed }) {
  const router = useRouter();
  const converting = Boolean(seed?.sourceDiscussionId);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(seed?.title ?? "");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [category, setCategory] = useState<CategoryId | "">(seed?.category ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [isSoftware, setIsSoftware] = useState(false);
  const [goals, setGoals] = useState<string[]>([""]);
  const [outcomes, setOutcomes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [confirmed, setConfirmed] = useState(!converting);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const cleanGoals = goals.map((g) => g.trim()).filter(Boolean);
  const steps = [
    { title: "The basics", valid: title.trim().length >= 4 && summary.trim().length >= 10 && !!category },
    { title: "Goals & outcomes", valid: cleanGoals.length > 0 },
    { title: "Who you need", valid: roles.every((r) => r.title.trim().length >= 3) },
    { title: "Review", valid: confirmed },
  ];

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createProject({
      title, summary, description, goals: cleanGoals, outcomes, category: category || undefined, visibility, isSoftware, tags,
      neededRoles: roles.map((r) => ({ title: r.title.trim(), skills: r.skills })),
      sourceDiscussionId: seed?.sourceDiscussionId ?? null,
    });
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      setError(res.error);
      if (res.fieldErrors && Object.keys(res.fieldErrors).some((k) => ["title", "summary", "category"].includes(k))) setStep(0);
      return;
    }
    toast.success(res.message);
    router.push(`/p/${res.data.slug}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s.title}>
            <button type="button" disabled={i > step && !steps.slice(0, i).every((x) => x.valid)} onClick={() => setStep(i)} className="w-full text-left disabled:cursor-not-allowed" aria-current={i === step ? "step" : undefined}>
              <span className={cn("block h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
              <span className={cn("mt-1.5 hidden text-xs sm:block", i === step ? "font-medium" : "text-muted-foreground")}>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <FormError message={error} />

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <Field label="Project name" htmlFor="ptitle" error={errors.title}>
            <Input id="ptitle" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className="h-10 text-base" />
          </Field>
          <Field label="One-line summary" htmlFor="psummary" error={errors.summary} hint="What is it, and who is it for? Shown on cards.">
            <Textarea id="psummary" value={summary} maxLength={280} rows={2} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="pcategory" error={errors.category}>
            <div id="pcategory" role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={category === c.id} onClick={() => setCategory(c.id)} className={cn("rounded-full border px-3 py-1 text-sm", category === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-ring")}>{c.label}</button>
              ))}
            </div>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Visibility">
            {([
              { id: "public", icon: Globe2, label: "Public", hint: "Anyone can find it and apply to help." },
              { id: "private", icon: Lock, label: "Private", hint: "Only invited members can see it." },
            ] as const).map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={visibility === o.id} onClick={() => setVisibility(o.id)} className={cn("flex gap-3 rounded-xl border p-3 text-left", visibility === o.id ? "border-primary ring-3 ring-primary/15" : "hover:border-ring/60")}>
                <o.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span><span className="block text-sm font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.hint}</span></span>
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <span className="flex gap-3">
              <Code2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span><span className="block text-sm font-medium">This involves building software</span><span className="block text-xs text-muted-foreground">Adds a Build workspace with GitHub and AI coding agents. You can change this later.</span></span>
            </span>
            <Switch checked={isSoftware} onCheckedChange={setIsSoftware} aria-label="Software project" />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Field label="Goals" htmlFor="goal-0" error={errors.goals} hint="Concrete things you want to achieve. Up to 8.">
            <div className="flex flex-col gap-2">
              {goals.map((g, i) => (
                <div key={i} className="flex gap-2">
                  <Input id={`goal-${i}`} value={g} maxLength={200} placeholder={i === 0 ? "e.g. Lend 100 tools in the first three months" : "Another goal"} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? e.target.value : x)))} />
                  {goals.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label="Remove goal" onClick={() => setGoals(goals.filter((_, j) => j !== i))}><Trash2 /></Button>}
                </div>
              ))}
              {goals.length < 8 && <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setGoals([...goals, ""])}><Plus /> Add goal</Button>}
            </div>
          </Field>
          <Field label="What does success look like?" htmlFor="outcomes" optional>
            <Textarea id="outcomes" value={outcomes} maxLength={2000} rows={3} onChange={(e) => setOutcomes(e.target.value)} placeholder="The real-world outcome you'll publish when it's done." />
          </Field>
          <Field label="Full description" htmlFor="pdesc" optional>
            <MarkdownEditor id="pdesc" value={description} onChange={setDescription} rows={6} />
          </Field>
          <Field label="Tags" htmlFor="ptags" optional>
            <TagInput id="ptags" value={tags} onChange={setTags} max={10} placeholder="Press Enter after each tag" />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Add the roles you&apos;d like help with. Each becomes an open opportunity people can apply to — you can add details later. Skip this if you&apos;re just exploring.</p>
          {roles.map((r, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border p-3">
              <div className="flex gap-2">
                <Input aria-label={`Role ${i + 1} title`} value={r.title} maxLength={80} placeholder="e.g. Illustrator for the launch poster" onChange={(e) => setRoles(roles.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove role" onClick={() => setRoles(roles.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
              <TagInput id={`role-skills-${i}`} value={r.skills} max={8} placeholder="Skills (press Enter)" onChange={(skills) => setRoles(roles.map((x, j) => (j === i ? { ...x, skills } : x)))} />
            </div>
          ))}
          {roles.length < 6 && <Button type="button" variant="outline" className="self-start" onClick={() => setRoles([...roles, { title: "", skills: [] }])}><Plus /> Add a role</Button>}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-3 rounded-2xl border bg-card p-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Project</dt><dd className="font-semibold">{title}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Summary</dt><dd>{summary}</dd></div>
            <div className="flex flex-wrap gap-6">
              <div><dt className="text-xs text-muted-foreground">Category</dt><dd>{category ? categoryLabel(category) : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Visibility</dt><dd className="capitalize">{visibility}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Software</dt><dd>{isSoftware ? "Yes" : "No"}</dd></div>
            </div>
            <div><dt className="text-xs text-muted-foreground">Goals</dt><dd><ul className="list-disc pl-5">{cleanGoals.map((g) => <li key={g}>{g}</li>)}</ul></dd></div>
            <div><dt className="text-xs text-muted-foreground">Open roles</dt><dd>{roles.length ? roles.map((r) => r.title).join(", ") : "None yet"}</dd></div>
          </dl>
          {converting && (
            <label className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-accent/50 p-3 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>
                Turn <strong>“{seed?.sourceTitle}”</strong> into this project. The discussion and all its comments stay exactly as they are and will link to the project.
                {visibility === "public" && seed?.participantCount ? ` ${seed.participantCount} ${seed.participantCount === 1 ? "person who took part" : "people who took part"} will be notified.` : ""}
              </span>
            </label>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        {step > 0 ? <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => setStep(step + 1)} disabled={!steps[step].valid}>Continue</Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending || !confirmed}>{pending ? "Creating…" : converting ? "Create project" : "Create project"}</Button>
        )}
      </div>
    </div>
  );
}
