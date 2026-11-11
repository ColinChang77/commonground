import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, Bot, ExternalLink, GitPullRequest, Package } from "lucide-react";
import { getDb } from "@/db";
import { githubIssues, githubPullRequests, profiles, taskSubmissions, tasks } from "@/db/schema";
import { loadProject } from "@/server/queries/project";
import { authorshipLabel, contributionTypeLabel, TASK_STATUS_LABEL } from "@/lib/constants";
import { Markdown } from "@/components/markdown";
import { TimeAgo } from "@/components/time-ago";
import { UserAvatar } from "@/components/user-avatar";
import { ReviewSubmission, SubmitWork, TaskControls } from "@/components/project/task-ui";
import { IssueSyncButton } from "@/components/build/issue-sync-button";
import { FocusLabel } from "@/components/realtime/room-provider";
import { TakeTaskButton } from "@/components/project/help-sheet";

export default async function TaskDetail({ params }: { params: Promise<{ slug: string; taskId: string }> }) {
  const { slug, taskId } = await params;
  const data = await loadProject(slug);
  if (!data) notFound();
  const { project, access, viewer, members, repo } = data;
  const db = getDb();
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, project.id))).limit(1);
  if (!t) notFound();
  const subs = await db
    .select({ s: taskSubmissions, displayName: profiles.displayName, username: profiles.username, avatarKey: profiles.avatarKey })
    .from(taskSubmissions)
    .innerJoin(profiles, eq(profiles.userId, taskSubmissions.submitterId))
    .where(eq(taskSubmissions.taskId, t.id))
    .orderBy(desc(taskSubmissions.createdAt));
  const [issue] = await db.select().from(githubIssues).where(eq(githubIssues.taskId, t.id)).limit(1);
  const prs = await db.select().from(githubPullRequests).where(eq(githubPullRequests.taskId, t.id)).orderBy(desc(githubPullRequests.updatedAt));
  const assignee = members.find((m) => m.userId === t.assigneeId);
  const manager = access.can("task.manage");
  const canWork = viewer && access.can("task.work");
  const mine = viewer?.id === t.assigneeId;
  const hasOpenSubmission = subs.some((x) => x.s.status === "submitted");

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <FocusLabel label={mine ? `Working on “${t.title}”` : `Looking at “${t.title}”`} />
      <Link href={`/p/${slug}/tasks`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Shared work</Link>
      <div className="rounded-2xl border bg-card p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{TASK_STATUS_LABEL[t.status as keyof typeof TASK_STATUS_LABEL]}</span>
          <span>{contributionTypeLabel(t.contributionType)}</span>
          {t.createdVia === "mcp" && <span className="inline-flex items-center gap-1"><Bot className="size-3" /> Created by an AI agent</span>}
          {t.dueAt && <span>Due {t.dueAt.toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
        </div>
        <h2 className="text-xl font-semibold">{t.title}</h2>
        {t.description && <Markdown source={t.description} className="mt-2" />}
        {t.deliverable && <p className="mt-3 flex gap-2 text-sm"><Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> <span><span className="text-muted-foreground">Deliverable:</span> {t.deliverable}</span></p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="flex items-center gap-2 text-sm">{assignee ? <><UserAvatar name={assignee.displayName} avatarKey={assignee.avatarKey} size={24} /> <span><strong>{mine ? "You are" : `${assignee.displayName} is`}</strong> {t.status === "done" ? "done with this ✅" : t.status === "in_review" ? "waiting for a review" : "working on this"}</span></> : <span className="text-muted-foreground">Nobody is on this yet</span>}</span>
          {!assignee && t.status !== "done" && viewer?.profile && !canWork && project.visibility === "public" && project.openJoin && <TakeTaskButton taskId={t.id} slug={slug} />}
          {canWork && <TaskControls taskId={t.id} status={t.status} assigneeId={t.assigneeId} viewerId={viewer.id} manager={manager} members={members} />}
        </div>
        {(issue || prs.length > 0 || (project.isSoftware && t.isCoding && repo && access.can("repo.manage"))) && (
          <div className="mt-4 flex flex-col gap-2 border-t pt-4 text-sm">
            {issue ? (
              <a href={issue.htmlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><ExternalLink className="size-3.5" /> GitHub issue #{issue.number} ({issue.state})</a>
            ) : (
              repo && t.isCoding && access.can("repo.manage") && <IssueSyncButton taskId={t.id} repo={repo.fullName} />
            )}
            {prs.map((pr) => <a key={pr.id} href={pr.htmlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline"><GitPullRequest className="size-3.5" /> PR #{pr.number}: {pr.title} <span className="text-muted-foreground">({pr.state})</span></a>)}
          </div>
        )}
      </div>

      {mine && t.status !== "done" && !hasOpenSubmission && <SubmitWork taskId={t.id} />}

      <section aria-label="Submissions">
        <h3 className="mb-3 text-base font-semibold">Submissions</h3>
        {subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No work submitted yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {subs.map(({ s, displayName, username, avatarKey }) => (
              <li key={s.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <UserAvatar name={displayName} avatarKey={avatarKey} size={24} />
                  <Link href={`/u/${username}`} className="font-medium hover:underline">{displayName}</Link>
                  <span className="text-xs text-muted-foreground"><TimeAgo date={s.createdAt} /></span>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{authorshipLabel(s.authorship)}{s.agentLabel ? ` · ${s.agentLabel}` : ""}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${s.status === "approved" ? "bg-success/15 text-success" : s.status === "changes_requested" ? "bg-warning/20" : "bg-muted"}`}>{s.status === "approved" ? "Verified" : s.status === "changes_requested" ? "Changes requested" : "Awaiting review"}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm">{s.summary}</p>
                {s.link && <a href={s.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ExternalLink className="size-3.5" /> {s.link}</a>}
                {s.reviewNote && <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm"><span className="text-muted-foreground">Reviewer: </span>{s.reviewNote}</p>}
                {s.status === "submitted" && access.can("contribution.verify") && viewer?.id !== s.submitterId && <ReviewSubmission submissionId={s.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
