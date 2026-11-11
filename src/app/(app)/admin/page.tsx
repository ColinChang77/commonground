import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getViewer, isStaff } from "@/lib/session";
import { PageHeader } from "@/components/shell/app-shell";
import { TimeAgo } from "@/components/time-ago";
import { ModerationButtons, UnsuspendButton } from "@/components/admin-ui";
import { REPORT_REASONS } from "@/lib/constants";
import { TeamBuildControls } from "@/components/build/team-controls";
import { BUILD_STAGES } from "@/lib/build-status";

export const metadata = { title: "Moderation" };

type R = { id: string; targetType: string; targetId: string; reason: string; details: string; createdAt: number; reporter: string; reportCount: number; preview: string | null; authorId: string | null; href: string | null };

export default async function AdminPage() {
  const v = await getViewer();
  if (!isStaff(v)) notFound();
  const db = getDb();
  const reports = await db.all<R>(sql`
    SELECT r.id, r.target_type AS targetType, r.target_id AS targetId, r.reason, r.details, r.created_at AS createdAt, p.username AS reporter,
      (SELECT count(*) FROM reports r2 WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id AND r2.status = 'open') AS reportCount,
      CASE r.target_type WHEN 'discussion' THEN (SELECT title FROM discussions WHERE id = r.target_id) WHEN 'comment' THEN (SELECT substr(body, 1, 200) FROM comments WHERE id = r.target_id)
        WHEN 'project' THEN (SELECT title FROM projects WHERE id = r.target_id) WHEN 'opportunity' THEN (SELECT title FROM opportunities WHERE id = r.target_id)
        ELSE (SELECT display_name || ' @' || username FROM profiles WHERE user_id = r.target_id) END AS preview,
      CASE r.target_type WHEN 'discussion' THEN (SELECT author_id FROM discussions WHERE id = r.target_id) WHEN 'comment' THEN (SELECT author_id FROM comments WHERE id = r.target_id)
        WHEN 'project' THEN (SELECT owner_id FROM projects WHERE id = r.target_id) WHEN 'opportunity' THEN (SELECT created_by FROM opportunities WHERE id = r.target_id) ELSE NULL END AS authorId,
      CASE r.target_type WHEN 'discussion' THEN '/d/' || r.target_id WHEN 'comment' THEN '/d/' || (SELECT discussion_id FROM comments WHERE id = r.target_id) || '#c-' || r.target_id
        WHEN 'project' THEN '/p/' || (SELECT slug FROM projects WHERE id = r.target_id) WHEN 'user' THEN '/u/' || (SELECT username FROM profiles WHERE user_id = r.target_id) ELSE NULL END AS href
    FROM reports r JOIN profiles p ON p.user_id = r.reporter_id
    WHERE r.status = 'open' AND r.id IN (SELECT min(id) FROM reports WHERE status = 'open' GROUP BY target_type, target_id)
    ORDER BY reportCount DESC, r.created_at ASC LIMIT 100`);
  const suspended = await db.all<{ userId: string; username: string; reason: string | null; at: number }>(sql`SELECT user_id AS userId, username, suspended_reason AS reason, suspended_at AS at FROM profiles WHERE suspended_at IS NOT NULL ORDER BY suspended_at DESC LIMIT 50`);
  // North Star: verified contributions in the last 7 days where contributor and verifier are two distinct humans.
  const [ns] = await db.all<{ wsc: number; agentEvents: number; signups: number; conv: number; accepted: number }>(sql`
    SELECT
      (SELECT count(*) FROM contributions WHERE status = 'verified' AND verified_at > unixepoch() * 1000 - 7 * 86400000 AND verified_by IS NOT NULL AND verified_by != user_id) AS wsc,
      (SELECT count(*) FROM analytics_events WHERE name LIKE 'agent.%' AND created_at > unixepoch() * 1000 - 7 * 86400000) AS agentEvents,
      (SELECT count(*) FROM analytics_events WHERE name = 'user.signed_up' AND created_at > unixepoch() * 1000 - 7 * 86400000) AS signups,
      (SELECT count(*) FROM analytics_events WHERE name = 'project.created_from_discussion' AND created_at > unixepoch() * 1000 - 7 * 86400000) AS conv,
      (SELECT count(*) FROM analytics_events WHERE name = 'collab.application_accepted' AND created_at > unixepoch() * 1000 - 7 * 86400000) AS accepted`);
  const builds = await db.all<{ id: string; title: string; description: string; status: string; previewUrl: string | null; note: string | null; createdAt: number; projectTitle: string; projectSlug: string; requester: string }>(sql`
    SELECT b.id, b.title, b.description, b.status, b.preview_url AS previewUrl, b.note, b.created_at AS createdAt, p.title AS projectTitle, p.slug AS projectSlug, pf.display_name AS requester
    FROM build_requests b JOIN projects p ON p.id = b.project_id JOIN profiles pf ON pf.user_id = b.requested_by
    WHERE b.builder = 'team' AND b.status NOT IN ('live','cancelled') ORDER BY b.created_at ASC LIMIT 100`);
  const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
  return (
    <div className="mx-auto max-w-[960px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader title="Moderation" description="Open reports, suspensions and weekly health." />
      <section aria-label="Last 7 days" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Successful collaborations", ns.wsc, "North Star"],
          ["New members", ns.signups, ""],
          ["Discussions → projects", ns.conv, ""],
          ["Accepted applications", ns.accepted, ""],
          ["Agent tool calls", ns.agentEvents, "AI, tracked separately"],
        ].map(([label, n, note]) => (
          <div key={label as string} className="rounded-2xl border bg-card p-4"><div className="font-heading text-2xl font-semibold tabular-nums">{n as number}</div><div className="text-xs text-muted-foreground">{label}</div>{note && <div className="mt-1 text-[0.68rem] font-medium text-primary">{note}</div>}</div>
        ))}
      </section>
      <h2 id="builds" className="mb-3 scroll-mt-20 text-base font-semibold">“Build it for me” requests ({builds.length})</h2>
      {builds.length === 0 ? <p className="mb-8 text-sm text-muted-foreground">No open team requests.</p> : (
        <ul className="mb-8 flex flex-col gap-3">
          {builds.map((b) => (
            <li key={b.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">{BUILD_STAGES.find((s) => s.id === b.status)?.label ?? b.status}</span><a href={`/p/${b.projectSlug}/build`} className="hover:underline">{b.projectTitle}</a><span>by {b.requester} · <TimeAgo date={b.createdAt} /></span></div>
              <p className="mt-2 text-sm font-semibold">{b.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{b.description}</p>
              {b.note && <p className="mt-1 text-sm">Note: “{b.note}”</p>}
              <TeamBuildControls id={b.id} status={b.status} />
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-3 text-base font-semibold">Open reports ({reports.length})</h2>
      {reports.length === 0 ? <p className="mb-8 text-sm text-muted-foreground">No open reports.</p> : (
        <ul className="mb-8 flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">{reasonLabel(r.reason)}</span><span className="capitalize">{r.targetType}</span><span>{r.reportCount} report{r.reportCount > 1 ? "s" : ""}</span><span>first by @{r.reporter} <TimeAgo date={r.createdAt} /></span></div>
              <p className="mt-2 text-sm font-medium">{r.preview ?? "[already removed]"}</p>
              {r.details && <p className="mt-1 text-sm text-muted-foreground">“{r.details}”</p>}
              {r.href && <a href={r.href} className="mt-1 inline-block text-xs text-primary hover:underline" target="_blank" rel="noreferrer">Open</a>}
              <div className="mt-3"><ModerationButtons reportId={r.id} targetType={r.targetType} targetId={r.targetId} authorId={r.authorId} /></div>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-3 text-base font-semibold">Suspended accounts</h2>
      {suspended.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <ul className="flex flex-col divide-y rounded-2xl border bg-card">{suspended.map((s) => <li key={s.userId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span>@{s.username} <span className="text-xs text-muted-foreground">— {s.reason} · <TimeAgo date={s.at} /></span></span><UnsuspendButton userId={s.userId} /></li>)}</ul>}
    </div>
  );
}
