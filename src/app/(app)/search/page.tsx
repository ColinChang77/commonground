import Link from "next/link";
import { FolderKanban, Handshake, MessagesSquare, Search as SearchIcon, UserRound } from "lucide-react";
import { getViewer } from "@/lib/session";
import { search, type SearchType } from "@/server/queries/search";
import { CATEGORIES, categoryLabel, PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/constants";
import { escapeHtml } from "@/lib/markdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

const TYPES: { id: SearchType; label: string }[] = [
  { id: "all", label: "All" }, { id: "discussion", label: "Discussions" }, { id: "project", label: "Projects" }, { id: "opportunity", label: "Opportunities" }, { id: "user", label: "People" },
];
const ICON = { discussion: MessagesSquare, project: FolderKanban, opportunity: Handshake, user: UserRound } as const;

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; cat?: string; status?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 120);
  const type = (TYPES.find((t) => t.id === sp.type)?.id ?? "all") as SearchType;
  const cat = CATEGORIES.some((c) => c.id === sp.cat) ? sp.cat! : null;
  const status = type === "project" && (PROJECT_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : null;
  const viewer = await getViewer();
  const hits = q.trim() ? await search(q, type, viewer?.id ?? null, { category: cat, status }) : [];
  const href = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, val] of Object.entries({ q, type: type === "all" ? null : type, cat, status, ...patch })) if (val) u.set(k, val);
    return `/search?${u}`;
  };
  return (
    <div className="mx-auto max-w-[720px] px-4 py-5 md:px-8 md:py-8">
      <h1 className="mb-4 text-2xl font-semibold">Search</h1>
      <form action="/search" className="mb-4 flex gap-2" role="search">
        <div className="relative flex-1"><SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input name="q" defaultValue={q} autoFocus placeholder="People, projects, ideas, roles…" aria-label="Search" className="h-11 pl-9 text-base" /></div>
        {type !== "all" && <input type="hidden" name="type" value={type} />}
        <Button type="submit" className="h-11">Search</Button>
      </form>
      <div className="-mx-4 mb-2 overflow-x-auto px-4"><ul className="flex min-w-max gap-1.5">{TYPES.map((t) => <li key={t.id}><Link href={href({ type: t.id === "all" ? null : t.id, status: null })} className={cn("inline-flex rounded-full border px-3 py-1 text-sm", type === t.id ? "border-foreground bg-foreground text-background" : "hover:border-ring")}>{t.label}</Link></li>)}</ul></div>
      <div className="-mx-4 mb-5 overflow-x-auto px-4"><ul className="flex min-w-max gap-1.5">
        {CATEGORIES.map((c) => <li key={c.id}><Link href={href({ cat: cat === c.id ? null : c.id })} className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs", cat === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-ring")}>{c.label}</Link></li>)}
        {type === "project" && PROJECT_STATUSES.map((s) => <li key={s}><Link href={href({ status: status === s ? null : s })} className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs", status === s ? "border-primary bg-primary text-primary-foreground" : "hover:border-ring")}>{PROJECT_STATUS_LABEL[s]}</Link></li>)}
      </ul></div>
      {!q.trim() ? (
        <p className="text-sm text-muted-foreground">Search discussions, projects, open roles and people.</p>
      ) : hits.length === 0 ? (
        <EmptyState icon={SearchIcon} title={`No results for “${q}”`}>Try fewer or different words.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {hits.map((h) => {
            const Icon = ICON[h.type as keyof typeof ICON] ?? SearchIcon;
            const snippet = escapeHtml(h.snippet ?? "").replace(/\[\[/g, "<mark class=\"rounded bg-primary/20 px-0.5 text-foreground\">").replace(/\]\]/g, "</mark>");
            return (
              <li key={`${h.type}-${h.id}`}>
                <Link href={h.href} className="flex gap-3 rounded-2xl border bg-card p-4 hover:border-ring/50">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">{h.title}</span>
                    <span className="block text-xs capitalize text-muted-foreground">{h.type}{h.meta ? ` · ${h.type === "discussion" ? categoryLabel(h.meta) : h.meta}` : ""}</span>
                    {h.snippet && <span className="mt-1 block text-sm text-foreground/80" dangerouslySetInnerHTML={{ __html: snippet }} />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
