import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export function Markdown({ source, className }: { source: string; className?: string }) {
  // renderMarkdown escapes all input and only emits a fixed allow-list of tags.
  return <div className={cn("prose-cg text-[0.95rem]", className)} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}
