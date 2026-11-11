import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Bot, CircleDot, ExternalLink, GitBranch, GitPullRequest, Lock, Rocket, ServerOff, ShieldCheck, Terminal } from "lucide-react";
import { getDb } from "@/db";
import { agentApprovals, agentRunEvents, agentSessions, buildRequests, githubInstallations, githubPullRequests, profiles, projectDeployments, taskSubmissions, tasks } from "@/db/schema";
import { buildStage } from "@/lib/build-status";
import { BuildRequestForm } from "@/components/build/request-form";
import { BuildRequestCard, type BuildCardData } from "@/components/build/request-card";
import { AgentRuns, PullRequestReview, type PrCard, type RunCard } from "@/components/build/agent-runs";
import { agentRuns } from "@/db/schema";
import { loadProject } from "@/server/queries/project";
import { githubConfig, installUrl } from "@/lib/github/config";
import { HOSTED_EXECUTION_UNAVAILABLE } from "@/lib/agents/providers";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { ApprovalButtons, RepoPicker, UnlinkRepo } from "@/components/build/build-ui";

function Panel({ title, icon: Icon, children, action }: { title: string; icon: typeof Bot; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" /> {title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const PR_STATE: Record<string, string> = { open: "text-success", merged: "text-[oklch(0.55_0.15_300)]", closed: "text-muted-foreground" };

export default async function BuildPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadProject(slug);
  if (!data) notFound();
  const { project, access, viewer, repo } = data;
  const db = getDb();
  const cfg = githubConfig();
  const manager = access.can("repo.manage");
  const installations = viewer && manager ? await db.select().from(githubInstallations).where(and(eq(githubInstallations.installedByUserId, viewer.id), isNull(githubInstallations.deletedAt))) : [];
  const codingTasks = await db.select().from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.isCoding, true), sql`${tasks.status} != 'done'`)).orderBy(desc(tasks.updatedAt)).limit(12);
  const approvals = await db
    .select({ a: agentApprovals, displayName: profiles.displayName })
    .from(agentApprovals)
    .innerJoin(profiles, eq(profiles.userId, agentApprovals.requestedBy))
    .where(and(eq(agentApprovals.projectId, project.id), eq(agentApprovals.status, "pending")))
    .orderBy(desc(agentApprovals.createdAt));
  const sessions = await db
    .select({ s: agentSessions, displayName: profiles.displayName })
    .from(agentSessions)
    .innerJoin(profiles, eq(profiles.userId, agentSessions.userId))
    .where(eq(agentSessions.projectId, project.id))
    .orderBy(desc(agentSessions.lastEventAt))
    .limit(6);
  const events = sessions.length
    ? await db.select().from(agentRunEvents).where(inArray(agentRunEvents.sessionId, sessions.map((s) => s.s.id))).orderBy(desc(agentRunEvents.createdAt)).limit(40)
    : [];
  const prs = repo ? await db.select().from(githubPullRequests).where(eq(githubPullRequests.projectRepositoryId, repo.id)).orderBy(desc(githubPullRequests.updatedAt)).limit(10) : [];
  const deployments = await db.select().from(projectDeployments).where(eq(projectDeployments.projectId, project.id)).orderBy(desc(projectDeployments.updatedAt)).limit(8);
  const latestPreview = deployments.find((d) => d.environment.toLowerCase() !== "production" && d.url && d.state === "success");

  const reqRows = await db.select({ r: buildRequests, t: tasks }).from(buildRequests).leftJoin(tasks, eq(tasks.id, buildRequests.taskId)).where(eq(buildRequests.projectId, project.id)).orderBy(desc(buildRequests.createdAt));
  const nameIds = [...new Set(reqRows.flatMap(({ r, t }) => [r.builtBy, t?.assigneeId].filter(Boolean) as string[]))];
  const names = nameIds.length ? await db.select({ id: profiles.userId, name: profiles.displayName }).from(profiles).where(inArray(profiles.userId, nameIds)) : [];
  const taskIds = reqRows.map(({ r }) => r.taskId).filter(Boolean) as string[];
  const subs = taskIds.length ? await db.select({ taskId: taskSubmissions.taskId, link: taskSubmissions.link }).from(taskSubmissions).where(inArray(taskSubmissions.taskId, taskIds)).orderBy(desc(taskSubmissions.createdAt)) : [];
  const cards: BuildCardData[] = reqRows.map(({ r, t }) => {
    const stage = buildStage(r, t ? { status: t.status, assigneeId: t.assigneeId } : null);
    const builderId = r.builder === "team" ? r.builtBy : t?.assigneeId;
    const subLink = subs.find((x) => x.taskId === r.taskId && x.link)?.link ?? null;
    return {
      id: r.id, title: r.title, description: r.description, kind: r.kind, builder: r.builder as "community" | "team", stage, createdAt: r.createdAt.getTime(),
      builderName: r.builder === "team" && builderId ? "CommonGround team" : (names.find((n) => n.id === builderId)?.name ?? null),
      previewUrl: r.previewUrl ?? subLink, liveUrl: r.liveUrl, note: r.note, taskHref: r.taskId ? `/p/${slug}/tasks/${r.taskId}` : null,
      canRespond: viewer?.id === r.requestedBy || access.can("approval.decide"), canCancel: viewer?.id === r.requestedBy || access.can("task.manage"),
    };
  });
  const active = cards.filter((c) => c.stage !== "cancelled");

  const runRows = await db.select({ r: agentRuns, person: profiles.displayName, avatar: profiles.avatarKey, taskTitle: tasks.title }).from(agentRuns).innerJoin(profiles, eq(profiles.userId, agentRuns.userId)).leftJoin(tasks, eq(tasks.id, agentRuns.taskId)).where(eq(agentRuns.projectId, project.id)).orderBy(desc(agentRuns.createdAt)).limit(8);
  const runEvents = runRows.length ? await db.select().from(agentRunEvents).where(inArray(agentRunEvents.runId, runRows.map((x) => x.r.id))).orderBy(desc(agentRunEvents.createdAt)).limit(200) : [];
  const runs: RunCard[] = runRows.map(({ r, person, avatar, taskTitle }) => {
    const evs = runEvents.filter((e) => e.runId === r.id);
    const withData = evs.map((e) => ({ e, d: JSON.parse(e.data || "{}") as { tests_passed?: number; tests_failed?: number; files_changed?: string[] } }));
    const tests = withData.find((x) => x.d.tests_passed !== undefined || x.d.tests_failed !== undefined)?.d ?? null;
    return {
      id: r.id, person, avatar, agent: r.agentLabel ?? "AI agent", taskTitle: taskTitle ?? r.prompt, taskHref: r.taskId ? `/p/${slug}/tasks/${r.taskId}` : null, status: r.status, branch: r.branch,
      startedAt: r.startedAt?.getTime() ?? null, lastMessage: evs[0]?.message ?? null, tests: tests ? { passed: tests.tests_passed, failed: tests.tests_failed } : null,
      ...(() => {
        const ap = approvals.find(({ a }) => a.action === "submit_contribution" && (JSON.parse(a.payload) as { runId?: string }).runId === r.id);
        const isMine = viewer?.id === r.userId;
        return { approvalId: ap?.a.id ?? null, canDecide: Boolean(ap) && (isMine || access.can("approval.decide")), isMine, hasBranch: Boolean(ap && (JSON.parse(ap.a.payload) as { branch?: string }).branch) };
      })(),
      files: withData.find((x) => x.d.files_changed?.length)?.d.files_changed ?? [], events: evs.slice(0, 40).map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.getTime() })),
    };
  });
  const prCards: PrCard[] = prs.filter((p) => p.state === "open").map((p) => ({ id: p.id, number: p.number, title: p.title, url: p.htmlUrl, state: p.state, canReview: access.can("contribution.verify"), author: p.authorLogin }));

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">{project.isSoftware ? "Build with AI" : "Website & app"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Need a page, a sign-up form or a booking system for this project? Ask for it here — a volunteer or our team builds it, and you just approve the result.</p>
      </div>
      {approvals.length > 0 && access.can("approval.decide") && (
        <a href="#ai-h" className="rounded-xl border border-warning/50 bg-warning/15 px-4 py-3 text-sm font-medium">👀 {approvals.length} piece{approvals.length > 1 ? "s" : ""} of AI work {approvals.length > 1 ? "are" : "is"} waiting for a review — see below.</a>
      )}
      {(runs.length > 0 || prCards.length > 0) && (
        <section aria-labelledby="ai-h" className="flex flex-col gap-3">
          <h2 id="ai-h" className="text-base font-bold">🤖 AI helpers at work</h2>
          <PullRequestReview prs={prCards} />
          <AgentRuns runs={runs} />
        </section>
      )}
      {project.isSoftware && access.can("agent.use") && runs.length === 0 && (
        <section className="rounded-xl border border-dashed p-4 text-sm">
          <h2 className="font-bold">Build with your own AI helper</h2>
          <p className="mt-1 text-muted-foreground">Use Claude Code, Codex or another coding agent on a to-do here. The whole team sees what it&apos;s doing live, and nothing is published until a person approves it.</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-muted-foreground"><li>Get a key in <a href="/settings/agents" className="font-semibold text-primary hover:underline">Settings → AI tools</a> and add it to your agent (copy-paste command provided).</li><li>Tell your agent: “Use CommonGround to start work on a to-do in {project.title}”.</li></ol>
        </section>
      )}
      {viewer && access.can("task.create") && <BuildRequestForm projectId={project.id} />}
      <section aria-labelledby="reqs-h" className="flex flex-col gap-3">
        <h2 id="reqs-h" className="text-base font-bold">Requests {active.length > 0 && <span className="text-muted-foreground">({active.length})</span>}</h2>
        {cards.length ? cards.map((c) => <BuildRequestCard key={c.id} r={c} />) : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing requested yet.{access.can("task.create") ? " Describe what you need above to get started." : ""}</p>}
      </section>
      <details id="advanced" className="group rounded-xl border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">▸ Advanced: GitHub, AI coding tools &amp; deployments <span className="font-normal">(for developers)</span></summary>
        <div className="border-t p-4">
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      {/* Left: requirements, tasks, sessions */}
      <div className="flex flex-col gap-4">
        <Panel title="Coding tasks" icon={CircleDot} action={<Link href={`/p/${slug}/tasks`} className="text-xs text-primary hover:underline">All</Link>}>
          {codingTasks.length ? (
            <ul className="flex flex-col gap-1">
              {codingTasks.map((t) => <li key={t.id}><Link href={`/p/${slug}/tasks/${t.id}`} className="-mx-2 block rounded-lg px-2 py-1.5 text-sm hover:bg-muted"><span className="block leading-snug">{t.title}</span><span className="text-xs text-muted-foreground">{t.status.replace("_", " ")} · {t.id.slice(0, 8)}</span></Link></li>)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No open coding tasks. Create one and mark it as a coding task.</p>}
        </Panel>
        <Panel title="Agent sessions" icon={Bot}>
          {sessions.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {sessions.map(({ s, displayName }) => (
                <li key={s.id}><span className="font-medium">{displayName}</span>&apos;s agent <span className="text-muted-foreground">({s.mode === "byo" ? "MCP" : s.providerId})</span><div className="text-xs text-muted-foreground">{s.clientName ?? "unknown client"} · active <TimeAgo date={s.lastEventAt} /></div></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No agent has connected to this project yet.</p>}
        </Panel>
      </div>

      {/* Center: approvals + live event log */}
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title={`Waiting for approval${approvals.length ? ` (${approvals.length})` : ""}`} icon={ShieldCheck}>
          {approvals.length ? (
            <ul className="flex flex-col gap-3">
              {approvals.map(({ a, displayName }) => {
                const p = JSON.parse(a.payload) as { summary?: string; body?: string; branch?: string; link?: string; authorship?: string; agentLabel?: string };
                return (
                  <li key={a.id} className="rounded-xl border bg-background p-3">
                    <div className="text-sm font-medium">{a.summary}</div>
                    <div className="text-xs text-muted-foreground">Requested by {displayName}&apos;s agent{p.agentLabel ? ` (${p.agentLabel})` : ""} · <TimeAgo date={a.createdAt} /></div>
                    {(p.summary || p.body) && <p className="mt-2 max-h-40 overflow-auto whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm">{p.summary ?? p.body}</p>}
                    {p.branch && <p className="mt-2 flex items-center gap-1.5 text-xs"><GitBranch className="size-3.5" /> Approving opens a pull request from <code className="rounded bg-muted px-1">{p.branch}</code>{repo ? <> — <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" href={`https://github.com/${repo.fullName}/compare/${encodeURIComponent(repo.defaultBranch)}...${encodeURIComponent(p.branch)}`}>review the diff on GitHub</a></> : null}</p>}
                    {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="size-3" /> {p.link}</a>}
                    {access.can("approval.decide") || (a.requestedBy === viewer?.id && a.action === "submit_contribution") ? <div className="mt-3"><ApprovalButtons id={a.id} /></div> : <p className="mt-2 text-xs text-muted-foreground">A project admin will review this.</p>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nothing waiting. When an agent submits work or drafts an update, it shows up here for a human to approve.</p>}
        </Panel>
        <Panel title="Agent activity" icon={Terminal}>
          {events.length ? (
            <ol className="flex max-h-[420px] flex-col gap-1.5 overflow-auto font-mono text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2"><span className="shrink-0 text-muted-foreground"><TimeAgo date={e.createdAt} /></span><span className={e.type === "approval_requested" ? "text-warning" : e.type === "error" ? "text-destructive" : ""}>{e.message}</span></li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted-foreground">Real events from connected agents appear here — every tool call is logged. Nothing has happened yet.</p>}
        </Panel>
        <Panel title="Hosted agents" icon={ServerOff}>
          <p className="text-sm text-muted-foreground">{HOSTED_EXECUTION_UNAVAILABLE.message}</p>
          <Button asChild size="sm" variant="outline" className="mt-3"><Link href="/settings/agents">Connect Claude Code, Codex or another MCP agent</Link></Button>
        </Panel>
      </div>

      {/* Right: repo, PRs, preview, deployments */}
      <div className="flex flex-col gap-4">
        <Panel title="Repository" icon={GitBranch} action={repo && manager ? <UnlinkRepo projectId={project.id} /> : undefined}>
          {repo ? (
            <div className="text-sm">
              <a href={`https://github.com/${repo.fullName}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium hover:underline">{repo.isPrivate && <Lock className="size-3.5" />}{repo.fullName}</a>
              <div className="text-xs text-muted-foreground">Default branch {repo.defaultBranch}{repo.lastPushAt ? <> · last push <TimeAgo date={repo.lastPushAt} /></> : null}</div>
            </div>
          ) : !cfg ? (
            <p className="text-sm text-muted-foreground">The CommonGround GitHub App isn&apos;t configured on this server yet (see docs/GITHUB_APP.md).</p>
          ) : manager ? (
            installations.length ? <RepoPicker projectId={project.id} installations={installations.map((i) => ({ id: i.id, accountLogin: i.accountLogin, accountType: i.accountType }))} /> : (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-muted-foreground">Install the CommonGround GitHub App on your account or organization, then pick a repository. You&apos;ll need to sign in with GitHub (Settings → Account) first.</p>
                <Button asChild size="sm" className="self-start"><a href={installUrl(cfg, `/p/${slug}/build`)}>Install GitHub App</a></Button>
              </div>
            )
          ) : <p className="text-sm text-muted-foreground">No repository linked yet.</p>}
        </Panel>
        <Panel title="Pull requests" icon={GitPullRequest}>
          {prs.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {prs.map((pr) => <li key={pr.id}><a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">#{pr.number} {pr.title}</a><div className={`text-xs ${PR_STATE[pr.state]}`}>{pr.state} · {pr.headRef} → {pr.baseRef}</div></li>)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{repo ? "No pull requests yet. GitHub webhooks keep this in sync." : "Link a repository to track pull requests."}</p>}
        </Panel>
        <Panel title="Preview & deployments" icon={Rocket}>
          {latestPreview?.url && <a href={latestPreview.url} target="_blank" rel="noopener noreferrer" className="mb-3 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"><ExternalLink className="size-4" /> Open latest preview</a>}
          {deployments.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {deployments.map((d) => <li key={d.id} className="flex items-center justify-between gap-2"><span><span className="font-medium">{d.environment}</span> <span className="text-xs text-muted-foreground">{d.sha?.slice(0, 7)} · <TimeAgo date={d.updatedAt} /></span></span><span className={`text-xs ${d.state === "success" ? "text-success" : d.state === "failure" || d.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>{d.logUrl ? <a href={d.logUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{d.state}</a> : d.state}</span></li>)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No deployments reported. Connect the repository to Vercel, Cloudflare Pages or Netlify through their GitHub integration — their preview deployments are reported to GitHub and appear here automatically. Production deploys stay under your provider&apos;s approval rules; CommonGround never deploys to production.</p>
          )}
        </Panel>
      </div>
    </div>
        </div>
      </details>
    </div>
  );
}
