import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { CalendarClock, GitBranch, ListTodo } from "lucide-react";
import { getDb } from "@/db";
import { nowMs } from "@/lib/clock";
import { loadProject } from "@/server/queries/project";
import { contributionTypeLabel, TASK_STATUSES, TASK_STATUS_LABEL } from "@/lib/constants";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { NewTask } from "@/components/project/task-ui";

type Row = { id: string; title: string; status: string; contributionType: string; isCoding: number; dueAt: number | null; assigneeName: string | null; assigneeAvatar: string | null; issueNumber: number | null };

export default async function Tasks({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadProject(slug);
  if (!data) notFound();
  const { project, access, viewer, members } = data;
  const rows = await getDb().all<Row>(sql`
    SELECT t.id, t.title, t.status, t.contribution_type AS contributionType, t.is_coding AS isCoding, t.due_at AS dueAt,
      p.display_name AS assigneeName, p.avatar_key AS assigneeAvatar,
      (SELECT number FROM github_issues gi WHERE gi.task_id = t.id LIMIT 1) AS issueNumber
    FROM tasks t LEFT JOIN profiles p ON p.user_id = t.assignee_id
    WHERE t.project_id = ${project.id} ORDER BY t.updated_at DESC LIMIT 300`);
  return (
    <div className="flex flex-col gap-5">
      {access.can("task.create") && viewer && (
        <div className="flex justify-end"><NewTask projectId={project.id} members={members} canAssign={access.can("task.manage")} viewerId={viewer.id} isSoftware={project.isSoftware} /></div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={ListTodo} title="No tasks yet">{access.can("task.create") ? "Break the goals down into tasks people can pick up." : "Tasks appear once the team plans the work."}</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUSES.map((s) => {
            const col = rows.filter((r) => r.status === s);
            return (
              <section key={s} aria-label={TASK_STATUS_LABEL[s]} className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-2.5">
                <h2 className="flex items-center justify-between px-1.5 text-sm font-semibold">{TASK_STATUS_LABEL[s]} <span className="text-xs font-normal text-muted-foreground tabular-nums">{col.length}</span></h2>
                {col.map((t) => (
                  <Link key={t.id} href={`/p/${slug}/tasks/${t.id}`} className="rounded-xl border bg-card p-3 transition-colors hover:border-ring/50">
                    <div className="text-sm font-medium leading-snug">{t.title}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{contributionTypeLabel(t.contributionType)}</span>
                      {t.issueNumber && <span className="inline-flex items-center gap-1"><GitBranch className="size-3" /> #{t.issueNumber}</span>}
                      {t.dueAt && <span className={`inline-flex items-center gap-1 ${t.dueAt < nowMs() && s !== "done" ? "text-destructive" : ""}`}><CalendarClock className="size-3" /> {new Date(t.dueAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                      <span className="ml-auto">{t.assigneeName ? <span className="inline-flex items-center gap-1"><UserAvatar name={t.assigneeName} avatarKey={t.assigneeAvatar} size={18} /> {t.assigneeName.split(" ")[0]}</span> : "Unassigned"}</span>
                    </div>
                  </Link>
                ))}
                {col.length === 0 && <p className="px-1.5 py-3 text-xs text-muted-foreground">Nothing here.</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
