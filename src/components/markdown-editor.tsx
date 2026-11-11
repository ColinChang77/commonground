"use client";
import { useId, useRef, useState } from "react";
import { Bold, Code, ImagePlus, Italic, Link2, List, Loader2, Quote } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { useImageUpload } from "@/components/image-upload";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  id?: string;
  onImage?: (key: string) => void;
  ariaLabel?: string;
};

const TOOLS = [
  { label: "Bold", icon: Bold },
  { label: "Italic", icon: Italic },
  { label: "Link", icon: Link2 },
  { label: "List", icon: List },
  { label: "Quote", icon: Quote },
  { label: "Code", icon: Code },
];

/** Lightweight rich-text editor: Markdown under the hood, toolbar + live preview. */
export function MarkdownEditor({ value, onChange, placeholder, rows = 8, maxLength = 20000, id, onImage, ariaLabel }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const tools = TOOLS;
  const tid = id ?? autoId;
  const [tab, setTab] = useState<"write" | "preview">("write");
  const { upload, pending } = useImageUpload("post");

  const wrap = (before: string, after = before, placeholderText = "text") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || placeholderText;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const prefixLines = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(start, e) || "item";
    const next = value.slice(0, start) + block.split("\n").map((l) => prefix + l).join("\n") + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => el.focus());
  };

  const runTool = (label: string) => {
    if (label === "Bold") wrap("**");
    else if (label === "Italic") wrap("*");
    else if (label === "Link") wrap("[", "](https://)", "link text");
    else if (label === "List") prefixLines("- ");
    else if (label === "Quote") prefixLines("> ");
    else if (label === "Code") wrap("`");
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <div role="tablist" aria-label="Editor mode" className="mr-1 flex">
          {(["write", "preview"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-md px-2.5 py-1 text-xs capitalize", tab === t ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </div>
        {tab === "write" &&
          tools.map((t) => (
            <button key={t.label} type="button" onClick={() => runTool(t.label)} aria-label={t.label} title={t.label} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <t.icon className="size-4" />
            </button>
          ))}
        {tab === "write" && onImage && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              aria-label="Attach image"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) {
                  const key = await upload(f);
                  if (key) onImage(key);
                }
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach image" title="Attach image" disabled={pending} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            </button>
          </>
        )}
        <span className="ml-auto pr-1.5 text-[0.7rem] tabular-nums text-muted-foreground">{value.length > maxLength * 0.8 ? `${value.length}/${maxLength}` : ""}</span>
      </div>
      {tab === "write" ? (
        <textarea
          ref={ref}
          id={tid}
          aria-label={ariaLabel}
          value={value}
          maxLength={maxLength}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "b") {
              e.preventDefault();
              wrap("**");
            } else if ((e.metaKey || e.ctrlKey) && e.key === "i") {
              e.preventDefault();
              wrap("*");
            }
          }}
          className="block w-full resize-y bg-transparent px-3.5 py-3 text-[0.95rem] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <div className="prose-cg min-h-[8rem] px-3.5 py-3 text-[0.95rem]" dangerouslySetInnerHTML={{ __html: value.trim() ? renderMarkdown(value) : '<p class="text-muted-foreground">Nothing to preview yet.</p>' }} />
      )}
    </div>
  );
}
