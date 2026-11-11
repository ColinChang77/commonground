import { and, desc, eq } from "drizzle-orm";
import { Bell } from "lucide-react";
import { getDb } from "@/db";
import { notifications, profiles, projectInvitations, projects } from "@/db/schema";
import { requireViewer } from "@/lib/session";
import { PageHeader } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/empty-state";
import { TimeAgo } from "@/components/time-ago";
import { UserAvatar } from "@/components/user-avatar";
import { InvitationButtons, MarkAllRead, NotificationLink } from "@/components/activity-ui";

export const metadata = { title: "Notifications" };

export default async function ActivityPage() {
  const v = await requireViewer("/activity");
  const db = getDb();
  const rows = await db
    .select({ n: notifications, actorName: profiles.displayName, actorAvatar: profiles.avatarKey })
    .from(notifications)
    .leftJoin(profiles, eq(profiles.userId, notifications.actorId))
    .where(eq(notifications.userId, v.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  const invites = await db
    .select({ i: projectInvitations, title: projects.title })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .where(and(eq(projectInvitations.inviteeId, v.id), eq(projectInvitations.status, "pending")));
  const unread = rows.filter((r) => !r.n.readAt).length;
  return (
    <div className="mx-auto max-w-[720px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up."} actions={unread ? <MarkAllRead /> : undefined} />
      {invites.length > 0 && (
        <section id="invitations" aria-label="Invitations" className="mb-6 flex flex-col gap-2">
          {invites.map(({ i, title }) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-accent/50 p-4">
              <p className="text-sm">You&apos;re invited to join <strong>{title}</strong> as a {i.role}.</p>
              <InvitationButtons id={i.id} />
            </div>
          ))}
        </section>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="No activity yet">Comments, applications, task assignments and verified contributions will show up here.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {rows.map(({ n, actorName, actorAvatar }) => (
            <li key={n.id} className="relative">
              <NotificationLink id={n.id} url={n.url} unread={!n.readAt}>
                {actorName ? <UserAvatar name={actorName} avatarKey={actorAvatar} size={36} /> : <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"><Bell className="size-4" /></span>}
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-muted-foreground">{n.body}</span>}
                  <span className="text-xs text-muted-foreground"><TimeAgo date={n.createdAt} /></span>
                </span>
                {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </NotificationLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
