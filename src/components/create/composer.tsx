"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, MessagesSquare, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { createDiscussion } from "@/server/discussions";
import { CATEGORIES, type CategoryId } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/form-field";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ImagePicker } from "@/components/image-upload";
import { ProjectWizard } from "@/components/create/project-wizard";
import { cn } from "@/lib/utils";

type Kind = "idea" | "discussion" | "project";

export function Composer({ initialKind, projectId, defaultCategory }: { initialKind: Kind; projectId?: string; defaultCategory?: CategoryId }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<CategoryId | "">(defaultCategory ?? "");
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const kinds = [
    { id: "idea" as const, label: "Idea", icon: Lightbulb, hint: "Something you’d like to make happen" },
    { id: "discussion" as const, label: "Question / chat", icon: MessagesSquare, hint: "Ask something or start a conversation" },
    ...(projectId ? [] : [{ id: "project" as const, label: "Project", icon: FolderKanban, hint: "Already know what you’re building" }]),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "project") return;
    setPending(true);
    setError(null);
    const res = await createDiscussion({ kind, title, body, category: category || undefined, imageKey, projectId: projectId ?? null });
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      setError(res.error);
      return;
    }
    toast.success(res.message);
    router.push(`/d/${res.data.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="What are you creating?" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn("flex items-start gap-3 rounded-2xl border bg-card p-3.5 text-left transition-colors", kind === k.id ? "border-primary ring-3 ring-primary/15" : "hover:border-ring/60")}
          >
            <k.icon className={cn("mt-0.5 size-5 shrink-0", kind === k.id ? "text-primary" : "text-muted-foreground")} aria-hidden />
            <span>
              <span className="block text-sm font-semibold">{k.label}</span>
              <span className="block text-xs text-muted-foreground">{k.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {kind === "project" ? (
        <ProjectWizard />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormError message={error} />
          <Field label="Title" htmlFor="title" error={errors.title}>
            <Input id="title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "idea" ? "e.g. A free tool library for our neighborhood" : "e.g. How do you keep volunteers motivated?"} className="h-10 text-base" />
          </Field>
          <Field label="Details" htmlFor="body" optional error={errors.body}>
            <MarkdownEditor id="body" value={body} onChange={setBody} onImage={setImageKey} placeholder={kind === "idea" ? "What's the idea? Who is it for? What would help make it real?" : "Share context so people can jump in."} />
          </Field>
          {imageKey && <ImagePicker value={imageKey} onChange={setImageKey} />}
          <Field label="Community" htmlFor="category" error={errors.category}>
            <div id="category" role="radiogroup" aria-label="Community" className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={category === c.id} aria-label={c.label} onClick={() => setCategory(c.id)} className={cn("rounded-full border px-3 py-1 text-sm", category === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-ring")}>
                  <span aria-hidden>{c.emoji}</span> c/{c.label.replace(/\s+/g, "")}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={pending || title.trim().length < 4 || !category}>{pending ? "Posting…" : "Post"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
