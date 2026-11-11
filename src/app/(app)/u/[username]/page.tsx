import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { BadgeCheck, Bot, Sparkles } from "lucide-react";
import { getDb } from "@/db";
import { getViewer } from "@/lib/session";
import { authorshipLabel, categoryLabel, contributionTypeLabel, OPEN_TO } from "@/lib/constants";
import { parseJson } from "@/server/queries/project";
import { FEED_POST_EXTRA_COLUMNS, type FeedPost } from "@/server/queries/feed";
import { UserAvatar } from "@/components/user-avatar";
import { PostCard } from "@/components/feed/post-card";
import { ProjectStatusBadge } from "@/components/project-status";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { ProfileActions } from "@/components/profile-ui";
import { SampleBadge } from "@/components/sample-badge";
import { pointsFor } from "@/lib/suggestions";
import { COPY } from "@/lib/copy";

type P = { userId: string; username: string; displayName: string; bio: string; avatarKey: string | null; collabPrefs: string; suspendedAt: number | null; isDemo: number; createdAt: number; followers: number; following: number; iFollow: number; blocked: number; blockedMe: number };

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  return { title: `@${(await params).username}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getViewer();
  const v = viewer?.id ?? "";
  const db = getDb();
  const [p] = await db.all<P>(sql`
    SELECT p.user_id AS userId, p.username, p.display_name AS displayName, p.bio, p.avatar_key AS avatarKey, p.collab_prefs AS collabPrefs, p.suspended_at AS suspendedAt, p.is_demo AS isDemo, p.created_at AS createdAt,
      (SELECT count(*) FROM follows WHERE followee_id = p.user_id) AS followers,
      (SELECT count(*) FROM follows WHERE follower_id = p.user_id) AS following,
      EXISTS (SELECT 1 FROM follows WHERE follower_id = ${v} AND followee_id = p.user_id) AS iFollow,
      EXISTS (SELECT 1 FROM blocks WHERE blocker_id = ${v} AND blocked_id = p.user_id) AS blocked,
      EXISTS (SELECT 1 FROM blocks WHERE blocker_id = p.user_id AND blocked_id = ${v}) AS blockedMe
    FROM profiles p WHERE lower(p.username) = ${username.toLowerCase()}`);
  if (!p || p.suspendedAt || p.blockedMe) notFound();
  const me = v === p.userId;
  const skills = await db.all<{ name: string }>(sql`SELECT s.name FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = ${p.userId}`);
  const interests = await db.all<{ category: string }>(sql`SELECT category FROM user_interests WHERE user_id = ${p.userId}`);
  const prefs = parseJson<{ openTo?: string[]; hoursPerWeek?: number | null }>(p.collabPrefs, {});
  const contribs = await db.all<{ id: string; title: string; type: string; authorship: string; agentLabel: string | null; verifiedAt: number; projectTitle: string; projectSlug: string }>(sql`
    SELECT c.id, c.title, c.type, c.authorship, c.agent_label AS agentLabel, c.verified_at AS verifiedAt, pr.title AS projectTitle, pr.slug AS projectSlug
    FROM contributions c JOIN projects pr ON pr.id = c.project_id
    WHERE c.user_id = ${p.userId} AND c.status = 'verified'
      AND (pr.visibility = 'public' OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = pr.id AND m.user_id = ${v}))
    ORDER BY c.verified_at DESC LIMIT 50`);
  const projs = await db.all<{ slug: string; title: string; status: string; role: string }>(sql`
    SELECT pr.slug, pr.title, pr.status, m.role FROM project_members m JOIN projects pr ON pr.id = m.project_id
    WHERE m.user_id = ${p.userId} AND (pr.visibility = 'public' OR EXISTS (SELECT 1 FROM project_members m2 WHERE m2.project_id = pr.id AND m2.user_id = ${v}))
    ORDER BY pr.updated_at DESC LIMIT 20`);
  const posts = p.blocked
    ? []
    : await db.all<FeedPost>(sql`
    SELECT d.id, d.kind, d.title, d.body, d.category, d.image_key AS imageKey, d.comment_count AS commentCount, d.reaction_count AS reactionCount, ${FEED_POST_EXTRA_COLUMNS(v)}, d.created_at AS createdAt, d.author_id AS authorId,
      ${p.username} AS username, ${p.displayName} AS displayName, ${p.avatarKey} AS avatarKey, NULL AS projectSlug, NULL AS projectTitle, cp.slug AS convertedSlug, cp.title AS convertedTitle,
      (SELECT group_concat(kind) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.user_id = ${v}) AS myReactions,
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.discussion_id = d.id AND b.user_id = ${v}) AS bookmarked
    FROM discussions d LEFT JOIN projects cp ON cp.id = d.converted_project_id AND cp.visibility = 'public'
    WHERE d.author_id = ${p.userId} AND d.status = 'published' AND d.project_id IS NULL ORDER BY d.created_at DESC LIMIT 20`);
  const distinctProjects = new Set(contribs.map((c) => c.projectSlug)).size;
  const pts = await pointsFor(db, p.userId);

  return (
    <div className="mx-auto grid max-w-[1040px] gap-8 px-4 py-5 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
          <UserAvatar name={p.displayName} avatarKey={p.avatarKey} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h1 className="flex items-center gap-2 text-2xl font-semibold">{p.displayName} {p.isDemo ? <SampleBadge /> : null}</h1><p className="text-sm text-muted-foreground">@{p.username} · joined <TimeAgo date={p.createdAt} /></p></div>
              {me ? <Button asChild variant="outline"><Link href="/settings/profile">Edit profile</Link></Button> : viewer?.profile ? <ProfileActions userId={p.userId} following={Boolean(p.iFollow)} blocked={Boolean(p.blocked)} /> : null}
            </div>
            {p.bio && <p className="mt-2 whitespace-pre-line text-[0.95rem]">{p.bio}</p>}
            <p className="mt-2 flex gap-4 text-sm text-muted-foreground"><span><strong className="text-foreground tabular-nums">{p.followers}</strong> followers</span><span><strong className="text-foreground tabular-nums">{p.following}</strong> following</span></p>
          </div>
        </header>
        <section aria-labelledby="points-h" data-testid="points-section" className="mb-8 rounded-xl border border-primary/30 bg-accent/30 p-4">
          <h2 id="points-h" className="text-base font-semibold">🏅 {COPY.points(pts.total)}</h2>
          <p className="mb-2 text-xs text-muted-foreground">Earned when a maker adopts a suggestion. Points stay on CommonGround — not money, not transferable.</p>
          {pts.items.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {pts.items.map((it, i) => <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm"><span className="min-w-0"><span className="font-medium">{it.title}</span><Link href={`/d/${it.discussionId}`} className="block truncate text-xs text-primary hover:underline">{it.discussionTitle}</Link></span><span className="shrink-0 text-xs font-semibold">+{it.points} · {it.reason === "adopted" ? "adopted" : it.reason === "merged" ? "live" : it.reason}</span></li>)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No adopted suggestions yet.</p>}
        </section>
        <section aria-labelledby="contrib-h" className="mb-8">
          <h2 id="contrib-h" className="mb-1 text-base font-semibold">Verified contributions</h2>
          <p className="mb-3 text-sm text-muted-foreground">{contribs.length ? `${contribs.length} verified across ${distinctProjects} project${distinctProjects === 1 ? "" : "s"}.` : "No verified contributions yet."}</p>
          {contribs.length > 0 && (
            <ul className="flex flex-col gap-2">
              {contribs.map((c) => (
                <li key={c.id} className="flex gap-3 rounded-xl border bg-card p-3">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <div className="min-w-0 text-sm"><span className="font-medium">{c.title}</span>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground"><Link href={`/p/${c.projectSlug}`} className="text-primary hover:underline">{c.projectTitle}</Link><span>{contributionTypeLabel(c.type)}</span>{c.authorship !== "human" && <span className="inline-flex items-center gap-1">{c.authorship === "agent_generated" ? <Bot className="size-3" /> : <Sparkles className="size-3" />}{authorshipLabel(c.authorship)}{c.agentLabel ? ` (${c.agentLabel})` : ""}</span>}<TimeAgo date={c.verifiedAt} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="posts-h">
          <h2 id="posts-h" className="mb-3 text-base font-semibold">Posts</h2>
          {posts.length ? <div className="flex flex-col gap-3">{posts.map((x) => <PostCard key={x.id} post={x} viewerId={viewer?.id ?? null} />)}</div> : <p className="text-sm text-muted-foreground">{p.blocked ? "You blocked this person." : "No posts yet."}</p>}
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        {(skills.length > 0 || interests.length > 0) && (
          <section className="rounded-2xl border bg-card p-4">
            {skills.length > 0 && <><h2 className="mb-2 text-sm font-semibold">Skills</h2><div className="mb-3 flex flex-wrap gap-1.5">{skills.map((s) => <Link key={s.name} href={`/collaborate?skill=${encodeURIComponent(s.name)}`} className="rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-accent">{s.name}</Link>)}</div></>}
            {interests.length > 0 && <><h2 className="mb-2 text-sm font-semibold">Interests</h2><div className="flex flex-wrap gap-1.5">{interests.map((i) => <span key={i.category} className="rounded-full border px-2.5 py-0.5 text-xs">{categoryLabel(i.category)}</span>)}</div></>}
          </section>
        )}
        {(prefs.openTo?.length || prefs.hoursPerWeek) && (
          <section className="rounded-2xl border bg-card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Open to</h2>
            <ul className="list-disc pl-5">{prefs.openTo?.map((o) => <li key={o}>{OPEN_TO.find((x) => x.id === o)?.label ?? o}</li>)}</ul>
            {prefs.hoursPerWeek ? <p className="mt-2 text-muted-foreground">About {prefs.hoursPerWeek} hrs/week</p> : null}
          </section>
        )}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Projects</h2>
          {projs.length ? <ul className="flex flex-col gap-1">{projs.map((x) => <li key={x.slug}><Link href={`/p/${x.slug}`} className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"><span className="min-w-0 truncate">{x.title}<span className="block text-xs capitalize text-muted-foreground">{x.role}</span></span><ProjectStatusBadge status={x.status} /></Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Not in any public projects yet.</p>}
        </section>
      </aside>
    </div>
  );
}
