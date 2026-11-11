import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { BadgeCheck, ExternalLink, MessagesSquare, Target } from "lucide-react";
import { getDb } from "@/db";
import { opportunities, projectUpdates, tasks } from "@/db/schema";
import { loadProject, parseJson } from "@/server/queries/project";
import { recentActivity } from "@/server/queries/activity";
import { compensationLabel, contributionTypeLabel } from "@/lib/constants";
import { Markdown } from "@/components/markdown";
import { TimeAgo } from "@/components/time-ago";
import { UserAvatar } from "@/components/user-avatar";
import { LiveActivity } from "@/components/project/live-activity";
import { WhosHere } from "@/components/realtime/whos-here";
import { TakeTaskButton } from "@/components/project/help-sheet";
import { Button } from "@/components/ui/button";

function Section({ title, id, action, children }: { title: string; id: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 id={id} className="text-base font-bold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export default async function ProjectHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadProject(slug);
  if (!data) notFound();
  const { project, viewer, role } = data;
  const db = getDb();
  const goals = parseJson<string[]>(project.goals, []);
  const tags = parseJson<string[]>(project.tags, []);
  const links = parseJson<{ label: string; url: string }[]>(project.links, []);
  const isMember = role !== null && role !== "viewer";
  const canTake = Boolean(viewer?.profile) && (isMember || (project.visibility === "public" && project.openJoin && project.status !== "archived"));
  const [activity, openTodos, roles, threads, milestones, credits] = await Promise.all([
    recentActivity(project.id, 15),
    db.select({ id: tasks.id, title: tasks.title, type: tasks.contributionType }).from(tasks).where(and(eq(tasks.projectId, project.id), isNull(tasks.assigneeId), sql`${tasks.status} != 'done'`)).orderBy(desc(tasks.createdAt)).limit(5),
    db.select().from(opportunities).where(and(eq(opportunities.projectId, project.id), eq(opportunities.status, "open"))).orderBy(desc(opportunities.createdAt)).limit(3),
    db.all<{ id: string; title: string; commentCount: number; lastActivityAt: number; author: string; avatar: string | null; isSource: number }>(sql`
      SELECT d.id, d.title, d.comment_count AS commentCount, d.last_activity_at AS lastActivityAt, p.display_name AS author, p.avatar_key AS avatar, (d.id = ${project.sourceDiscussionId ?? ""}) AS isSource
      FROM discussions d JOIN profiles p ON p.user_id = d.author_id
      WHERE d.status = 'published' AND d.kind != 'update' AND (d.project_id = ${project.id} OR d.id = ${project.sourceDiscussionId ?? ""})
      ORDER BY d.last_activity_at DESC LIMIT 4`),
    db.select().from(projectUpdates).where(and(eq(projectUpdates.projectId, project.id), eq(projectUpdates.status, "published"))).orderBy(desc(projectUpdates.createdAt)).limit(3),
    db.all<{ id: string; title: string; type: string; name: string; avatar: string | null; verifiedAt: number }>(sql`
      SELECT c.id, c.title, c.type, p.display_name AS name, p.avatar_key AS avatar, c.verified_at AS verifiedAt FROM contributions c JOIN profiles p ON p.user_id = c.user_id
      WHERE c.project_id = ${project.id} AND c.status = 'verified' ORDER BY c.verified_at DESC LIMIT 4`),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Section title="What's happening" id="happening-h"><LiveActivity initial={activity} /></Section>

        <Section title="Ways to help" id="help-h" action={<Link href={`/p/${slug}/opportunities`} className="text-sm font-semibold text-primary hover:underline">See all</Link>}>
          {openTodos.length === 0 && roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everything is taken right now. Say hi in the conversation — new needs pop up all the time.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {openTodos.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  <span className="min-w-0 flex-1"><Link href={`/p/${slug}/tasks/${t.id}`} className="block text-sm font-semibold hover:underline">{t.title}</Link><span className="text-xs text-muted-foreground">{contributionTypeLabel(t.type)} · nobody on it yet</span></span>
                  {canTake ? <TakeTaskButton taskId={t.id} slug={slug} /> : null}
                </li>
              ))}
              {roles.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5">
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{r.title}</span><span className="text-xs text-muted-foreground">Ongoing role · {[r.commitment, compensationLabel(r.compensation)].filter(Boolean).join(" · ")}</span></span>
                  {!isMember && <Button asChild size="sm" variant="ghost" className="shrink-0 rounded-full"><Link href={`/p/${slug}/opportunities#${r.id}`}>Apply</Link></Button>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Conversation" id="conv-h" action={<Link href={`/p/${slug}/discussion`} className="text-sm font-semibold text-primary hover:underline">Open</Link>}>
          {threads.length ? (
            <ul className="flex flex-col">
              {threads.map((t) => (
                <li key={t.id}><Link href={`/d/${t.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                  <UserAvatar name={t.author} avatarKey={t.avatar} size={28} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{t.title}</span><span className="text-xs text-muted-foreground">{t.isSource ? "Where this project started · " : ""}{t.commentCount} {t.commentCount === 1 ? "reply" : "replies"} · <TimeAgo date={t.lastActivityAt} /></span></span>
                  <MessagesSquare className="size-4 text-muted-foreground" aria-hidden />
                </Link></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No threads yet.</p>}
          {isMember && <Button asChild variant="outline" size="sm" className="mt-2 rounded-full"><Link href={`/p/${slug}/discussion`}>Start a thread</Link></Button>}
        </Section>

        <Section title="Results" id="results-h" action={<Link href={`/p/${slug}/updates`} className="text-sm font-semibold text-primary hover:underline">All results</Link>}>
          {milestones.length === 0 && credits.length === 0 ? <p className="text-sm text-muted-foreground">Finished work and milestones will show here — and on everyone&apos;s profiles.</p> : (
            <ul className="flex flex-col gap-2">
              {milestones.map((m) => <li key={m.id} className="flex gap-2.5 text-sm"><span aria-hidden>{m.isMilestone ? "🏁" : "📣"}</span><span className="min-w-0"><span className="font-semibold">{m.title}</span> <span className="text-xs text-muted-foreground"><TimeAgo date={m.createdAt} /></span></span></li>)}
              {credits.map((c) => <li key={c.id} className="flex items-center gap-2.5 text-sm"><BadgeCheck className="size-4 shrink-0 text-success" aria-hidden /><span className="min-w-0"><span className="font-semibold">{c.name}</span> — {c.title} <span className="text-xs text-muted-foreground">({contributionTypeLabel(c.type)})</span></span></li>)}
            </ul>
          )}
        </Section>
      </div>

      <aside className="flex flex-col gap-4">
        <WhosHere />
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><Target className="size-4 text-primary" /> What we&apos;re making</h2>
          <ol className="flex flex-col gap-1.5 text-sm">{goals.map((g, i) => <li key={i} className="flex gap-2"><span className="font-bold text-primary tabular-nums">{i + 1}</span><span>{g}</span></li>)}</ol>
          {project.outcomes && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{project.outcomes}</p>}
        </section>
        {project.description && (
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-bold">About this project</summary>
            <Markdown source={project.description} className="mt-2 text-sm" />
          </details>
        )}
        {(tags.length > 0 || links.length > 0) && (
          <section className="rounded-xl border bg-card p-4">
            {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((t) => <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-accent">#{t}</Link>)}</div>}
            {links.length > 0 && <ul className={tags.length ? "mt-3 flex flex-col gap-1 border-t pt-3" : "flex flex-col gap-1"}>{links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><ExternalLink className="size-3.5" /> {l.label}</a></li>)}</ul>}
          </section>
        )}
      </aside>
    </div>
  );
}
