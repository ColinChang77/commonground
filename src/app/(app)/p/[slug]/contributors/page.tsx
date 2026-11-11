import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { BadgeCheck, Bot, Sparkles, UserRound } from "lucide-react";
import { getDb } from "@/db";
import { loadProject } from "@/server/queries/project";
import { authorshipLabel, contributionTypeLabel } from "@/lib/constants";
import { UserAvatar } from "@/components/user-avatar";
import { TimeAgo } from "@/components/time-ago";
import { InviteForm, LogContribution, MemberMenu, VerifyButtons } from "@/components/project/member-ui";

type Contrib = { id: string; userId: string; type: string; title: string; description: string; authorship: string; agentLabel: string | null; status: string; verifiedAt: number | null; createdAt: number; displayName: string; username: string; avatarKey: string | null; verifierName: string | null; prUrl: string | null };

const AUTH_ICON = { human: UserRound, ai_assisted: Sparkles, agent_generated: Bot } as const;

export default async function Contributors({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadProject(slug);
  if (!data) notFound();
  const { project, access, members, role, viewer } = data;
  const rows = await getDb().all<Contrib>(sql`
    SELECT c.id, c.user_id AS userId, c.type, c.title, c.description, c.authorship, c.agent_label AS agentLabel, c.status, c.verified_at AS verifiedAt, c.created_at AS createdAt,
      p.display_name AS displayName, p.username, p.avatar_key AS avatarKey, vp.display_name AS verifierName,
      (SELECT html_url FROM github_pull_requests pr WHERE pr.id = c.pull_request_id) AS prUrl
    FROM contributions c JOIN profiles p ON p.user_id = c.user_id LEFT JOIN profiles vp ON vp.user_id = c.verified_by
    WHERE c.project_id = ${project.id} AND c.status != 'rejected' ORDER BY c.created_at DESC LIMIT 200`);
  const verified = rows.filter((r) => r.status === "verified");
  const pending = rows.filter((r) => r.status === "pending");
  const byUser = new Map<string, number>();
  for (const r of verified) byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + 1);
  const canManage = access.can("members.manage");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        {pending.length > 0 && (access.can("contribution.verify") || pending.some((p) => p.userId === viewer?.id)) && (
          <section aria-labelledby="pending-h" className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <h2 id="pending-h" className="mb-3 text-sm font-semibold">Waiting for verification</h2>
            <ul className="flex flex-col gap-2">
              {pending.filter((p) => access.can("contribution.verify") || p.userId === viewer?.id).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3">
                  <UserAvatar name={c.displayName} avatarKey={c.avatarKey} size={28} />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{c.title}</div><div className="text-xs text-muted-foreground">{c.displayName} · {contributionTypeLabel(c.type)} · {authorshipLabel(c.authorship)}</div></div>
                  {access.can("contribution.verify") && c.userId !== viewer?.id ? <VerifyButtons id={c.id} /> : <span className="text-xs text-muted-foreground">Pending</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="ver-h">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="ver-h" className="text-base font-semibold">Verified contributions</h2>
            {access.can("task.work") && <LogContribution projectId={project.id} />}
          </div>
          {verified.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No verified contributions yet. When an admin approves submitted work, it&apos;s recorded here and on the contributor&apos;s profile.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {verified.map((c) => {
                const Icon = AUTH_ICON[c.authorship as keyof typeof AUTH_ICON] ?? UserRound;
                return (
                  <li key={c.id} className="flex gap-3 rounded-xl border bg-card p-3.5">
                    <Link href={`/u/${c.username}`}><UserAvatar name={c.displayName} avatarKey={c.avatarKey} size={32} /></Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm"><span className="font-medium">{c.title}</span><BadgeCheck className="size-4 text-success" aria-label="Verified" /></div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <Link href={`/u/${c.username}`} className="hover:underline">{c.displayName}</Link>
                        <span>{contributionTypeLabel(c.type)}</span>
                        <span className="inline-flex items-center gap-1"><Icon className="size-3" /> {authorshipLabel(c.authorship)}{c.agentLabel ? ` (${c.agentLabel})` : ""}</span>
                        {c.verifierName && <span>Verified by {c.verifierName} {c.verifiedAt && <TimeAgo date={c.verifiedAt} />}</span>}
                        {c.prUrl && <a href={c.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Pull request</a>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Members ({members.length})</h2>
          <ul className="flex flex-col gap-1">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2.5 py-1">
                <Link href={`/u/${m.username}`}><UserAvatar name={m.displayName} avatarKey={m.avatarKey} size={30} /></Link>
                <div className="min-w-0 flex-1 leading-tight"><Link href={`/u/${m.username}`} className="block truncate text-sm font-medium hover:underline">{m.displayName}</Link><span className="text-xs capitalize text-muted-foreground">{m.role}{byUser.get(m.userId) ? ` · ${byUser.get(m.userId)} verified` : ""}</span></div>
                {canManage && m.userId !== viewer?.id && role && <MemberMenu projectId={project.id} userId={m.userId} role={m.role} viewerRole={role} />}
              </li>
            ))}
          </ul>
          {canManage && <div className="mt-4 border-t pt-4"><h3 className="mb-2 text-xs font-medium text-muted-foreground">Invite someone</h3><InviteForm projectId={project.id} canInviteAdmin={role === "owner"} /></div>}
        </section>
        <p className="px-1 text-xs text-muted-foreground">Credit comes from verified work, not commit counts. Each contribution shows whether it was human-authored, AI-assisted or agent-generated.</p>
      </aside>
    </div>
  );
}
