/**
 * Comment → change request pipeline for showcase threads.
 * Pure w.r.t. HTTP: every function takes the DB, so integration tests can drive it directly.
 *
 * Demo mode (this build): triage is a scripted stand-in (no model key is configured), the coding/review
 * agents and the GitHub pull request are labelled test doubles. Nothing reaches GitHub or a cloud sandbox.
 */
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { newId } from "@/lib/ids";

export type TriageKind = "change" | "question" | "praise" | "ignore";
export type Triage = { kind: TriageKind; title: string; restated: string; question: string | null; risk: "small" | "builder"; source: string };

const CHANGE = /\b(too (small|big|tiny|large|hard|slow|dark|light)|can'?t|cannot|hard to|broken|doesn'?t work|typo|misspell|color|colour|contrast|font|bigger|smaller|add|change|remove|make|should|button|mobile|phone)\b/i;
const PRAISE = /\b(love|great|nice|awesome|amazing|cool|beautiful|well done)\b/i;

/** Scripted triage stand-in used when no model key is configured. Labelled as such everywhere it shows. */
export function demoTriage(text: string): Triage {
  const t = text.trim();
  const source = "demo-triage (scripted stand-in, no model key)";
  if (t.length < 4 || /https?:\/\/\S+.*https?:\/\//i.test(t)) return { kind: "ignore", title: "", restated: "", question: null, risk: "builder", source };
  const isChange = CHANGE.test(t);
  if (!isChange && PRAISE.test(t)) return { kind: "praise", title: "", restated: "", question: null, risk: "builder", source };
  if (!isChange) return { kind: t.includes("?") ? "question" : "ignore", title: "", restated: "", question: null, risk: "builder", source };
  if (/button/i.test(t) && /(small|tiny|tap|press|hit|reach|phone|mobile)/i.test(t))
    return { kind: "change", risk: "small", source, title: "Bigger tap target for the main button on phones", restated: "Make the main button larger on phone screens (at least 48px tall, full width) so it's easy to tap with a thumb.", question: "Do you mean the green “Add expense” button at the bottom of the screen?" };
  if (/(font|text|read)/i.test(t) && /(small|tiny|hard|read)/i.test(t))
    return { kind: "change", risk: "small", source, title: "Larger body text", restated: "Increase the body text size so it's easier to read on small screens.", question: "Is it the list of items that's hard to read?" };
  if (/(colou?r|contrast|dark|light)/i.test(t))
    return { kind: "change", risk: "small", source, title: "Better color contrast", restated: "Raise the color contrast so text stands out from the background.", question: null };
  if (/(typo|misspell|spelling)/i.test(t))
    return { kind: "change", risk: "small", source, title: "Fix a typo", restated: "Fix the spelling mistake the commenter pointed out.", question: null };
  return { kind: "change", risk: "builder", source, title: t.length > 60 ? `${t.slice(0, 57)}…` : t, restated: `Change requested in plain words: “${t.slice(0, 280)}”. The maker decides how to handle it.`, question: null };
}

export type ShowcaseRow = { discussionId: string; builderId: string; repoFullName: string; demoUrl: string | null; autoPr: number; paused: number; demoMode: number };

export async function getShowcase(db: DB, discussionId: string): Promise<ShowcaseRow | null> {
  const [row] = await db.all<ShowcaseRow>(sql`SELECT discussion_id AS discussionId, builder_id AS builderId, repo_full_name AS repoFullName, demo_url AS demoUrl, auto_pr AS autoPr, paused, demo_mode AS demoMode FROM showcases WHERE discussion_id = ${discussionId}`);
  return row ?? null;
}

export type SuggestionRow = { id: string; discussionId: string; commentId: string; authorId: string; kind: string; risk: string; title: string; restated: string; question: string | null; status: string; preview: string | null; prNumber: number | null; triageSource: string; createdAt: number; updatedAt: number };
const SELECT = sql`SELECT id, discussion_id AS discussionId, comment_id AS commentId, author_id AS authorId, kind, risk, title, restated, question, status, preview, pr_number AS prNumber, triage_source AS triageSource, created_at AS createdAt, updated_at AS updatedAt FROM suggestions`;

export async function getSuggestion(db: DB, id: string) {
  const [row] = await db.all<SuggestionRow>(sql`${SELECT} WHERE id = ${id}`);
  return row ?? null;
}

export async function listSuggestions(db: DB, discussionId: string) {
  return db.all<SuggestionRow>(sql`${SELECT} WHERE discussion_id = ${discussionId} ORDER BY created_at ASC`);
}

export async function listEvents(db: DB, discussionId: string) {
  return db.all<{ id: string; suggestionId: string; actor: string; message: string; createdAt: number }>(sql`
    SELECT e.id, e.suggestion_id AS suggestionId, e.actor, e.message, e.created_at AS createdAt
    FROM suggestion_events e JOIN suggestions s ON s.id = e.suggestion_id WHERE s.discussion_id = ${discussionId} ORDER BY e.created_at ASC`);
}

async function event(db: DB, suggestionId: string, actor: string, message: string) {
  await db.run(sql`INSERT INTO suggestion_events (id, suggestion_id, actor, message, created_at) VALUES (${newId()}, ${suggestionId}, ${actor}, ${message}, ${Date.now()})`);
}

async function setStatus(db: DB, id: string, status: string, extra: { preview?: string; prNumber?: number } = {}) {
  await db.run(sql`UPDATE suggestions SET status = ${status}, updated_at = ${Date.now()},
    preview = COALESCE(${extra.preview ?? null}, preview), pr_number = COALESCE(${extra.prNumber ?? null}, pr_number) WHERE id = ${id}`);
}

/** Called after a comment lands on a showcase thread. Returns the new suggestion id when the comment is actionable. */
export async function triageComment(db: DB, sc: ShowcaseRow, comment: { id: string; authorId: string; body: string }, triage: (t: string) => Triage = demoTriage): Promise<string | null> {
  if (sc.paused || comment.authorId === sc.builderId) return null;
  const tr = triage(comment.body);
  if (tr.kind !== "change") return null;
  const id = newId();
  const now = Date.now();
  await db.run(sql`INSERT INTO suggestions (id, discussion_id, comment_id, author_id, kind, risk, title, restated, question, status, triage_source, created_at, updated_at)
    VALUES (${id}, ${sc.discussionId}, ${comment.id}, ${comment.authorId}, ${tr.kind}, ${tr.risk}, ${tr.title}, ${tr.restated}, ${tr.question}, 'confirming', ${tr.source}, ${now}, ${now}) ON CONFLICT(comment_id) DO NOTHING`);
  await event(db, id, "triage", `Actionable change (${tr.risk === "small" ? "small text/style fix" : "needs the maker"}).`);
  return id;
}

export type Step = { status: string; actor: string; message: string; delayMs: number; preview?: string };

/** The demo execution plan after the commenter confirms. Each step is persisted + pushed live. */
export function demoPlan(s: Pick<SuggestionRow, "title" | "risk">, repo: string): Step[] {
  const preview = s.risk === "small" ? "Main button: 36px → 48px tall, full width under 640px. 1 file changed (styles), 2 tests passed." : "Draft change prepared for the maker to look at.";
  return [
    { status: "queued", actor: "triage", message: "Queued for the coding agent.", delayMs: 2000 },
    { status: "running", actor: "coding", message: `Coding agent started in an isolated sandbox on a copy of ${repo} (demo backend).`, delayMs: 5000 },
    { status: "reviewing", actor: "review", message: "Review agent (a different model) is checking the diff and test results.", delayMs: 5000 },
    { status: "preview_ready", actor: "review", message: "Review passed. Preview is ready.", delayMs: 4000, preview },
    { status: s.risk === "small" ? "sent" : "builder_review", actor: "system", message: s.risk === "small" ? "Sent to the maker for approval." : "Outside the auto rules — sent to the maker to decide.", delayMs: 3000 },
  ];
}

export async function confirmSuggestion(db: DB, id: string) {
  const s = await getSuggestion(db, id);
  if (!s || s.status !== "confirming") return null;
  await event(db, id, "viewer", "Commenter confirmed the change request.");
  return s;
}

export async function runPlan(db: DB, id: string, steps: Step[], onStep: () => Promise<void>, sleep: (ms: number) => Promise<void>) {
  for (const st of steps) {
    await sleep(st.delayMs);
    const cur = await getSuggestion(db, id);
    if (!cur || cur.status === "declined") return;
    await setStatus(db, id, st.status, { preview: st.preview });
    await event(db, id, st.actor, st.message);
    await onStep();
  }
}

export const POINTS = { adopted: 10, merged: 20, helpful: 5 } as const;
export const DAILY_CAP_PER_SHOWCASE = 60;

/** Awards points once per (suggestion, reason), never to the builder, capped per person per showcase per day. */
export async function awardPoints(db: DB, sc: ShowcaseRow, s: SuggestionRow, reason: keyof typeof POINTS) {
  if (s.authorId === sc.builderId) return 0;
  const since = Date.now() - 86_400_000;
  const [row] = await db.all<{ n: number }>(sql`SELECT COALESCE(SUM(points), 0) AS n FROM contribution_points WHERE user_id = ${s.authorId} AND discussion_id = ${sc.discussionId} AND created_at > ${since}`);
  const room = Math.max(0, DAILY_CAP_PER_SHOWCASE - (row?.n ?? 0));
  const pts = Math.min(POINTS[reason], room);
  if (pts <= 0) return 0;
  await db.run(sql`INSERT INTO contribution_points (id, user_id, discussion_id, suggestion_id, reason, points, created_at) VALUES (${newId()}, ${s.authorId}, ${sc.discussionId}, ${s.id}, ${reason}, ${pts}, ${Date.now()}) ON CONFLICT(suggestion_id, reason) DO NOTHING`);
  return pts;
}

export async function adoptSuggestion(db: DB, sc: ShowcaseRow, s: SuggestionRow) {
  if (!["sent", "builder_review", "preview_ready"].includes(s.status)) return null;
  const [row] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM suggestions WHERE discussion_id = ${sc.discussionId} AND pr_number IS NOT NULL`);
  const prNumber = 41 + (row?.n ?? 0);
  await setStatus(db, s.id, "pr_opened", { prNumber });
  await event(db, s.id, "builder", `Maker approved. Pull request #${prNumber} opened on ${sc.repoFullName} by the CommonGround GitHub App (demo test double — not sent to GitHub). Credit: suggested by the commenter.`);
  const pts = await awardPoints(db, sc, s, "adopted");
  return { prNumber, points: pts };
}

export async function markMerged(db: DB, sc: ShowcaseRow, s: SuggestionRow) {
  if (s.status !== "pr_opened") return null;
  await setStatus(db, s.id, "merged");
  await event(db, s.id, "builder", `Pull request #${s.prNumber} merged by the maker (simulated). CommonGround never merges on its own.`);
  return { points: await awardPoints(db, sc, s, "merged") };
}

export async function declineSuggestion(db: DB, s: SuggestionRow) {
  if (["pr_opened", "merged", "declined"].includes(s.status)) return false;
  await setStatus(db, s.id, "declined");
  await event(db, s.id, "builder", "Maker declined this suggestion.");
  return true;
}

export async function pointsFor(db: DB, userId: string) {
  const [row] = await db.all<{ n: number }>(sql`SELECT COALESCE(SUM(points), 0) AS n FROM contribution_points WHERE user_id = ${userId}`);
  const items = await db.all<{ title: string; points: number; reason: string; discussionId: string; discussionTitle: string; createdAt: number }>(sql`
    SELECT s.title, cp.points, cp.reason, cp.discussion_id AS discussionId, d.title AS discussionTitle, cp.created_at AS createdAt
    FROM contribution_points cp JOIN suggestions s ON s.id = cp.suggestion_id JOIN discussions d ON d.id = cp.discussion_id
    WHERE cp.user_id = ${userId} ORDER BY cp.created_at DESC LIMIT 30`);
  return { total: row?.n ?? 0, items };
}

export async function showcaseContributors(db: DB, discussionId: string) {
  return db.all<{ userId: string; displayName: string; username: string; avatarKey: string | null; points: number }>(sql`
    SELECT cp.user_id AS userId, p.display_name AS displayName, p.username, p.avatar_key AS avatarKey, SUM(cp.points) AS points
    FROM contribution_points cp JOIN profiles p ON p.user_id = cp.user_id WHERE cp.discussion_id = ${discussionId}
    GROUP BY cp.user_id ORDER BY points DESC LIMIT 10`);
}
