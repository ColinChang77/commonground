import Link from "next/link";
import { sql } from "drizzle-orm";
import { FolderKanban, Handshake, Search } from "lucide-react";
import { getDb } from "@/db";
import { getViewer } from "@/lib/session";
import { CATEGORIES, COMPENSATION, compensationLabel, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/constants";
import { PageHeader } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/empty-state";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WithdrawButton } from "@/components/collaborate-ui";
import { cn } from "@/lib/utils";

type Opp = { id: string; title: string; description: string; compensation: string; commitment: string; deadline: number | null; createdAt: number; projectTitle: string; projectSlug: string; category: string; skills: string | null };
type App = { id: string; status: string; createdAt: number; title: string; projectTitle: string; projectSlug: string };
type Mine = { slug: string; title: string; status: string; role: string; openTasks: number };

export const metadata = { title: "Projects" };

export default async function CollaboratePage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; comp?: string; skill?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const db = getDb();
  const q = (sp.q ?? "").trim().slice(0, 80);
  const cat = CATEGORIES.some((c) => c.id === sp.cat) ? sp.cat! : null;
  const comp = COMPENSATION.some((c) => c.id === sp.comp) ? sp.comp! : null;
  const skill = (sp.skill ?? "").trim().toLowerCase().slice(0, 40);
  const opps = await db.all<Opp>(sql`
    SELECT o.id, o.title, o.description, o.compensation, o.commitment, o.deadline, o.created_at AS createdAt, p.title AS projectTitle, p.slug AS projectSlug, p.category,
      (SELECT group_concat(s.name, '|') FROM opportunity_skills os JOIN skills s ON s.id = os.skill_id WHERE os.opportunity_id = o.id) AS skills
    FROM opportunities o JOIN projects p ON p.id = o.project_id
    WHERE o.status = 'open' AND p.visibility = 'public' AND p.status != 'archived' AND (o.deadline IS NULL OR o.deadline > unixepoch() * 1000)
      ${q ? sql`AND (o.title LIKE ${`%${q}%`} OR o.description LIKE ${`%${q}%`} OR p.title LIKE ${`%${q}%`})` : sql``}
      ${cat ? sql`AND p.category = ${cat}` : sql``}
      ${comp ? sql`AND o.compensation = ${comp}` : sql``}
      ${skill ? sql`AND EXISTS (SELECT 1 FROM opportunity_skills os JOIN skills s ON s.id = os.skill_id WHERE os.opportunity_id = o.id AND (s.slug LIKE ${`%${skill}%`} OR lower(s.name) LIKE ${`%${skill}%`}))` : sql``}
      ${viewer ? sql`AND NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${viewer.id} AND m.role != 'viewer')` : sql``}
    ORDER BY o.created_at DESC LIMIT 60`);
  const apps = viewer
    ? await db.all<App>(sql`SELECT a.id, a.status, a.created_at AS createdAt, o.title, p.title AS projectTitle, p.slug AS projectSlug FROM applications a JOIN opportunities o ON o.id = a.opportunity_id JOIN projects p ON p.id = a.project_id WHERE a.applicant_id = ${viewer.id} ORDER BY a.updated_at DESC LIMIT 30`)
    : [];
  const mine = viewer
    ? await db.all<Mine>(sql`SELECT p.slug, p.title, p.status, m.role, (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = ${viewer.id} AND t.status != 'done') AS openTasks FROM project_members m JOIN projects p ON p.id = m.project_id WHERE m.user_id = ${viewer.id} ORDER BY p.updated_at DESC`)
    : [];
  const link = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const merged = { q: q || null, cat, comp, skill: skill || null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/collaborate${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="flex gap-8 px-4 py-5 md:px-8 md:py-8">
      <div className="min-w-0 flex-1">
        <PageHeader title="Projects" description="Real projects looking for people like you. Find one that needs what you’re good at." actions={viewer?.profile ? <Button asChild><Link href="/create?type=project">Start a project</Link></Button> : undefined} />
        <form className="mb-3 flex gap-2" action="/collaborate">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input name="q" defaultValue={q} placeholder="Search projects and roles" aria-label="Search opportunities" className="h-10 pl-9" /></div>
          <Input name="skill" defaultValue={skill} placeholder="Skill" aria-label="Filter by skill" className="h-10 w-32" />
          {cat && <input type="hidden" name="cat" value={cat} />}
          {comp && <input type="hidden" name="comp" value={comp} />}
          <Button type="submit" variant="outline" className="h-10">Search</Button>
        </form>
        <div className="-mx-4 mb-2 overflow-x-auto px-4 md:mx-0 md:px-0"><ul className="flex min-w-max gap-1.5" aria-label="Categories">
          <li><Link href={link({ cat: null })} className={cn("inline-flex rounded-full border px-3 py-1 text-xs", !cat ? "border-foreground bg-foreground text-background" : "hover:border-ring")}>All categories</Link></li>
          {CATEGORIES.map((c) => <li key={c.id}><Link href={link({ cat: c.id })} className={cn("inline-flex rounded-full border px-3 py-1 text-xs", cat === c.id ? "border-foreground bg-foreground text-background" : "hover:border-ring")}>{c.label}</Link></li>)}
        </ul></div>
        <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0"><ul className="flex min-w-max gap-1.5" aria-label="Compensation">
          {COMPENSATION.map((c) => <li key={c.id}><Link href={link({ comp: comp === c.id ? null : c.id })} aria-pressed={comp === c.id} className={cn("inline-flex rounded-full border px-3 py-1 text-xs", comp === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-ring")}>{c.label}</Link></li>)}
        </ul></div>
        {opps.length === 0 ? (
          <EmptyState icon={Handshake} title={q || cat || comp || skill ? "No roles match those filters" : "No open roles yet"}>{q || cat || comp || skill ? "Try removing a filter." : "When projects post opportunities, they'll appear here."}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {opps.map((o) => (
              <li key={o.id} className="relative rounded-2xl border bg-card p-4 transition-colors hover:border-ring/40">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold"><Link href={`/p/${o.projectSlug}/opportunities#${o.id}`} className="after:absolute after:inset-0">{o.title}</Link></h2>
                  <span className="text-xs font-medium">{compensationLabel(o.compensation)}</span>
                </div>
                <p className="text-sm text-primary">{o.projectTitle}</p>
                <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{o.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {o.skills?.split("|").map((s) => <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-foreground">{s}</span>)}
                  {o.commitment && <span>{o.commitment}</span>}
                  <span className="ml-auto">Posted <TimeAgo date={o.createdAt} /></span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {viewer && (
        <aside className="hidden w-[300px] shrink-0 flex-col gap-4 lg:flex">
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FolderKanban className="size-4" /> My projects</h2>
            {mine.length ? <ul className="flex flex-col">{mine.map((m) => <li key={m.slug}><Link href={`/p/${m.slug}`} className="-mx-2 block rounded-lg px-2 py-1.5 hover:bg-muted"><span className="block text-sm font-medium">{m.title}</span><span className="text-xs capitalize text-muted-foreground">{m.role} · {PROJECT_STATUS_LABEL[m.status as ProjectStatus]}{m.openTasks ? ` · ${m.openTasks} task${m.openTasks > 1 ? "s" : ""} for you` : ""}</span></Link></li>)}</ul> : <p className="text-sm text-muted-foreground">You haven&apos;t joined a project yet.</p>}
          </section>
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">My applications</h2>
            {apps.length ? (
              <ul className="flex flex-col gap-2">
                {apps.map((a) => (
                  <li key={a.id} className="text-sm">
                    <Link href={`/p/${a.projectSlug}/opportunities`} className="font-medium hover:underline">{a.title}</Link>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{a.projectTitle} · <span className={a.status === "accepted" ? "text-success" : a.status === "rejected" ? "text-destructive" : ""}>{a.status}</span></span>{a.status === "pending" && <WithdrawButton id={a.id} />}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Applications you send show up here.</p>}
          </section>
        </aside>
      )}
    </div>
  );
}
