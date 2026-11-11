import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ArrowRight, Bot, Globe2, Lock } from "lucide-react";
import { getDb } from "@/db";
import { opportunities, profiles, tasks } from "@/db/schema";
import { SampleBadge } from "@/components/sample-badge";
import { loadProject } from "@/server/queries/project";
import { communityName } from "@/lib/constants";
import { ProjectStatusBadge } from "@/components/project-status";
import { ProjectTabs } from "@/components/project/project-tabs";
import { UserAvatar } from "@/components/user-avatar";
import { RoomProvider } from "@/components/realtime/room-provider";
import { PresenceBar } from "@/components/realtime/presence-bar";
import { HelpButton, type HelpData } from "@/components/project/help-sheet";
import { CommunityIcon } from "@/components/community-icon";
import { Button } from "@/components/ui/button";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const data = await loadProject((await params).slug);
  return data ? { title: data.project.title, description: data.project.summary } : { title: "Project not found" };
}

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadProject(slug);
  if (!data) notFound();
  const { project, access, members, counts, viewer, role, owner } = data;
  const db = getDb();
  const [ownerRow] = await db.select({ d: profiles.isDemo }).from(profiles).where(eq(profiles.userId, project.ownerId)).limit(1);
  const ownerIsDemo = Boolean(ownerRow?.d);
  const manager = access.can("application.review");
  const isMember = role !== null && role !== "viewer";
  const [prog] = await db.all<{ total: number; done: number }>(sql`SELECT count(*) AS total, sum(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM tasks WHERE project_id = ${project.id}`);
  const total = prog?.total ?? 0;
  const done = prog?.done ?? 0;
  const roles = await db.select().from(opportunities).where(and(eq(opportunities.projectId, project.id), eq(opportunities.status, "open"))).orderBy(desc(opportunities.createdAt)).limit(3);
  const roleSkills = roles.length ? await db.all<{ oid: string; name: string }>(sql`SELECT os.opportunity_id AS oid, s.name FROM opportunity_skills os JOIN skills s ON s.id = os.skill_id WHERE os.opportunity_id IN (${sql.join(roles.map((r) => sql`${r.id}`), sql`, `)})`) : [];
  const openTodos = await db.select({ id: tasks.id, title: tasks.title, type: tasks.contributionType }).from(tasks).where(and(eq(tasks.projectId, project.id), isNull(tasks.assigneeId), sql`${tasks.status} != 'done'`)).orderBy(desc(tasks.createdAt)).limit(4);
  const [mine] = viewer && isMember ? await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.assigneeId, viewer.id), sql`${tasks.status} != 'done'`)).orderBy(desc(tasks.updatedAt)).limit(1) : [];
  const help: HelpData = {
    slug, projectId: project.id, title: project.title, openJoin: project.visibility === "public" && project.openJoin && project.status !== "completed" && project.status !== "archived", signedIn: Boolean(viewer?.profile),
    roles: roles.map((r) => ({ id: r.id, title: r.title, commitment: r.commitment, compensation: r.compensation, skills: roleSkills.filter((s) => s.oid === r.id).map((s) => s.name) })),
    todos: openTodos,
  };
  const tabs = [
    { href: "", label: "Home" },
    { href: "/discussion", label: "Conversation" },
    { href: "/opportunities", label: "Ways to help", badge: manager ? counts.pendingApps : counts.openRoles || undefined },
    { href: "/tasks", label: "Shared work", badge: counts.openTasks || undefined },
    { href: "/updates", label: "Results" },
    { href: "/contributors", label: "Team", badge: manager ? counts.pendingContribs || undefined : undefined },
    { href: "/build", label: project.isSoftware ? "Build with AI" : "Website & app", badge: manager ? counts.pendingApprovals + counts.buildReviews || undefined : undefined },
    ...(access.can("project.edit") ? [{ href: "/settings", label: "Settings" }] : []),
  ];
  return (
    <RoomProvider room={`p:${project.id}`} selfId={viewer?.profile ? viewer.id : null}>
      <div className="px-3 py-4 md:px-6 md:py-6">
        <header className="mb-4 rounded-xl border bg-card p-4 md:p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link href={`/c/${project.category}`} className="flex items-center gap-1.5 font-semibold text-foreground hover:underline"><CommunityIcon id={project.category} size={18} /> {communityName(project.category)}</Link>
            <ProjectStatusBadge status={project.status} />
            {ownerIsDemo && <SampleBadge />}
            <span className="inline-flex items-center gap-1">{project.visibility === "private" ? <Lock className="size-3" /> : <Globe2 className="size-3" />} {project.visibility === "private" ? "Private" : "Public"}</span>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight md:text-[1.8rem]">{project.title}</h1>
              <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">{project.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link href={`/p/${slug}/contributors`} className="flex items-center gap-2" aria-label={`${members.length} people on the team`}>
                  <span className="flex -space-x-2">{members.slice(0, 6).map((m) => <UserAvatar key={m.userId} name={m.displayName} avatarKey={m.avatarKey} size={28} className="ring-2 ring-card" />)}</span>
                  <span className="text-sm text-muted-foreground">{members.length} on the team{owner ? ` · started by ${owner.displayName.split(" ")[0]}` : ""}</span>
                </Link>
                <PresenceBar />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
              {!isMember ? (
                project.status === "completed" ? <Button asChild size="lg" className="rounded-full px-5"><Link href={`/p/${slug}/updates`}>Explore the outcome <ArrowRight /></Link></Button> : <HelpButton data={help} />
              ) : mine ? (
                <Button asChild size="lg" className="max-w-xs rounded-full px-5"><Link href={`/p/${slug}/tasks/${mine.id}`}><span className="truncate">Continue: {mine.title}</span> <ArrowRight /></Link></Button>
              ) : (
                <HelpButton data={help} label="Pick something to do" />
              )}
              {project.isSoftware && isMember && <Button asChild variant="outline" size="sm" className="rounded-full"><Link href={`/p/${slug}/build`}><Bot /> Build with AI</Link></Button>}
            </div>
          </div>
          {total > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{done} of {total} things done</span><span>{Math.round((done / total) * 100)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Project progress"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(done / total) * 100}%` }} /></div>
            </div>
          )}
        </header>
        <ProjectTabs slug={slug} tabs={tabs} />
        <div className="pt-5">{children}</div>
      </div>
    </RoomProvider>
  );
}
