/**
 * Comment → change request pipeline for showcase threads.
 * Pure w.r.t. HTTP: every function takes the DB, so integration tests can drive it directly.
 *
 * Three gates before any pull request exists: (1) the commenter confirms the restated change,
 * (2) the commenter approves a before/after screen recording, (3) the builder approves.
 *
 * Demo mode (this build): triage is a scripted rule set (no model key is configured), the coding/review
 * agents and the GitHub pull request are labelled test doubles, and the preview recordings are real
 * Playwright recordings of a demo target page (scripts/record-previews.mjs). In production the cloud
 * sandbox records the pull request's preview deployment instead. Nothing reaches GitHub.
 */
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { newId } from "@/lib/ids";

export type Quality = "actionable" | "needs_builder" | "vague" | "spam" | "abusive" | "not_a_change";
export type Triage = { quality: Quality; reason: string; title: string; restated: string; question: string | null; risk: "small" | "builder"; reply: string | null; source: string };

const SOURCE = "demo-triage (scripted rules, no model key)";
const UI_NOUN = /\b(button|text|font|colou?r|contrast|page|menu|list|screen|icon|image|form|logo|header|footer|title|link|spacing|layout|chart|total|input|field|tab)\b/i;
const CHANGE_VERB = /\b(too (small|big|tiny|large|hard|slow|dark|light|low|high)|can'?t|cannot|hard to|broken|doesn'?t work|typo|misspell|bigger|smaller|larger|add|change|remove|make|should|move|missing|keep missing)\b/i;
const VAGUE = /\b(looks? (bad|weird|off|meh)|ugly|sucks|hate it|meh|not good|bad lol|boring|could be better|don'?t like)\b/i;
const SPAM = /\b(buy now|discount|promo code|crypto|airdrop|follow me|check out my|dm me|free money)\b/i;
const ABUSE = /\b(idiot|stupid|trash dev|loser)\b/i;
const BIG = /\b(rewrite|redesign|whole app|from scratch|add (login|payments|accounts)|new feature|integrate|migrate)\b/i;
const PRAISE = /\b(love|great|nice|awesome|amazing|cool|beautiful|well done)\b/i;

/** Scripted triage used when no model key is configured. Every rule actually runs on the comment text. */
export function demoTriage(text: string): Triage {
  const t = text.trim();
  const base = { title: "", restated: "", question: null, risk: "builder" as const, reply: null, source: SOURCE };
  const links = (t.match(/https?:\/\//gi) ?? []).length;
  if (SPAM.test(t) || links >= 2) return { ...base, quality: "spam", reason: "Looks like an ad or spam (promotional words or several links). Not answered." };
  if (ABUSE.test(t)) return { ...base, quality: "abusive", reason: "Insulting or off-topic. Not answered." };
  const words = t.split(/\s+/).filter(Boolean).length;
  const concrete = UI_NOUN.test(t) && CHANGE_VERB.test(t);
  if (!concrete && (VAGUE.test(t) || (CHANGE_VERB.test(t) && words < 6)))
    return { ...base, quality: "vague", reason: "Too vague to act on — no specific part of the app or change named.", reply: "Thanks! Could you say a bit more — which part bothered you, and what would make it better?" };
  if (!concrete) return { ...base, quality: "not_a_change", reason: PRAISE.test(t) ? "Praise — not a change request." : t.includes("?") ? "A question — the maker can answer it in the thread." : "No change requested." };
  if (BIG.test(t)) return { ...base, quality: "needs_builder", reason: "Too big to change automatically — the maker decides the direction.", title: t.length > 60 ? `${t.slice(0, 57)}…` : t, restated: `Bigger change requested: “${t.slice(0, 240)}”.` };
  if (/button/i.test(t) && /(small|tiny|tap|press|hit|reach|phone|mobile|missing)/i.test(t))
    return { ...base, quality: "actionable", risk: "small", reason: "Specific UI fix on a named element, small and in scope.", title: "Bigger tap target for the main button on phones", restated: "Make the main button larger on phone screens (at least 48px tall, full width) so it's easy to tap with a thumb.", question: "Do you mean the green “Add expense” button at the bottom of the screen?" };
  if (/(font|text)/i.test(t)) return { ...base, quality: "actionable", risk: "small", reason: "Specific text-size fix, small and in scope.", title: "Larger body text", restated: "Increase the body text size so it's easier to read on small screens.", question: "Is it the list of expenses that's hard to read?" };
  if (/(colou?r|contrast)/i.test(t)) return { ...base, quality: "actionable", risk: "small", reason: "Specific color/contrast fix, small and in scope.", title: "Better color contrast", restated: "Raise the color contrast so text stands out from the background.", question: null };
  return { ...base, quality: "actionable", risk: "builder", reason: "Specific, but not a small text/style fix — the maker approves before anything runs.", title: t.length > 60 ? `${t.slice(0, 57)}…` : t, restated: `Change requested in plain words: “${t.slice(0, 240)}”.` };
}

export type ShowcaseRow = { discussionId: string; builderId: string; repoFullName: string; demoUrl: string | null; autoPr: number; paused: number; demoMode: number };

export async function getShowcase(db: DB, discussionId: string): Promise<ShowcaseRow | null> {
  const [row] = await db.all<ShowcaseRow>(sql`SELECT discussion_id AS discussionId, builder_id AS builderId, repo_full_name AS repoFullName, demo_url AS demoUrl, auto_pr AS autoPr, paused, demo_mode AS demoMode FROM showcases WHERE discussion_id = ${discussionId}`);
  return row ?? null;
}

export type SuggestionRow = {
  id: string; discussionId: string; commentId: string; authorId: string; kind: string; risk: string; title: string; restated: string; question: string | null; status: string;
  preview: string | null; prNumber: number | null; triageSource: string; quality: string; reason: string; aiReply: string | null; previewVideoUrl: string | null; round: number; feedback: string | null; createdAt: number; updatedAt: number;
};
const SELECT = sql`SELECT id, discussion_id AS discussionId, comment_id AS commentId, author_id AS authorId, kind, risk, title, restated, question, status, preview, pr_number AS prNumber,
  triage_source AS triageSource, quality, reason, ai_reply AS aiReply, preview_video_url AS previewVideoUrl, round, feedback, created_at AS createdAt, updated_at AS updatedAt FROM suggestions`;

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

async function setStatus(db: DB, id: string, status: string, extra: { preview?: string; prNumber?: number; previewVideoUrl?: string } = {}) {
  await db.run(sql`UPDATE suggestions SET status = ${status}, updated_at = ${Date.now()},
    preview = COALESCE(${extra.preview ?? null}, preview), pr_number = COALESCE(${extra.prNumber ?? null}, pr_number),
    preview_video_url = COALESCE(${extra.previewVideoUrl ?? null}, preview_video_url) WHERE id = ${id}`);
}

export const MAX_REQUESTS_PER_DAY = 5;

/**
 * Called after a comment lands on a showcase thread. Every triaged comment is recorded (so the builder's
 * "Filtered" column can show what was held back and why); only actionable ones start the gates.
 */
export async function triageComment(db: DB, sc: ShowcaseRow, comment: { id: string; authorId: string; body: string }, triage: (t: string) => Triage = demoTriage): Promise<{ id: string; quality: Quality } | null> {
  if (sc.paused || comment.authorId === sc.builderId) return null;
  const tr = triage(comment.body);
  let quality = tr.quality;
  let reason = tr.reason;
  if (quality === "actionable" || quality === "needs_builder") {
    const [row] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM suggestions WHERE author_id = ${comment.authorId} AND quality IN ('actionable','needs_builder') AND created_at > ${Date.now() - 86_400_000}`);
    if ((row?.n ?? 0) >= MAX_REQUESTS_PER_DAY) { quality = "vague"; reason = `Daily limit reached (${MAX_REQUESTS_PER_DAY} change requests per person per day).`; }
  }
  const status = quality === "actionable" ? "confirming" : quality === "needs_builder" ? "builder_review" : "filtered";
  const id = newId();
  const now = Date.now();
  await db.run(sql`INSERT INTO suggestions (id, discussion_id, comment_id, author_id, kind, risk, title, restated, question, status, triage_source, quality, reason, ai_reply, created_at, updated_at)
    VALUES (${id}, ${sc.discussionId}, ${comment.id}, ${comment.authorId}, 'change', ${tr.risk}, ${tr.title || comment.body.slice(0, 80)}, ${tr.restated}, ${tr.question}, ${status}, ${tr.source}, ${quality}, ${reason}, ${tr.reply}, ${now}, ${now})
    ON CONFLICT(comment_id) DO NOTHING`);
  await event(db, id, "triage", `${quality === "actionable" ? "Actionable" : quality === "needs_builder" ? "Needs the maker" : "Filtered"}: ${reason}`);
  return { id, quality };
}

export type Step = { status: string; actor: string; message: string; delayMs: number; preview?: string; previewVideoUrl?: string };

/** The demo execution plan for one round. Each step is persisted + pushed live; it ends with a screen recording. */
export function demoPlan(s: Pick<SuggestionRow, "risk">, repo: string, round = 1): Step[] {
  const preview = round === 1 ? "Main button: 30px → 48px tall, full width on phones. 1 file changed (styles), 2 tests passed." : "Main button: 48px → 60px tall, larger label. 1 file changed (styles), 2 tests passed.";
  return [
    { status: "queued", actor: "triage", message: round === 1 ? "Queued for the coding agent." : "Feedback received — starting another round.", delayMs: 1200 },
    { status: "running", actor: "coding", message: `Coding agent started in an isolated sandbox on a copy of ${repo} (demo backend).`, delayMs: 2800 },
    { status: "reviewing", actor: "review", message: "Review agent (a different model) is checking the diff and test results.", delayMs: 2800 },
    { status: "preview_recorded", actor: "review", message: `Review passed. Recorded the change on a phone screen, before and after (round ${round}).`, delayMs: 2400, preview, previewVideoUrl: `/demo-previews/round${Math.min(round, 2)}.mp4` },
  ];
}

export async function confirmSuggestion(db: DB, id: string) {
  const s = await getSuggestion(db, id);
  if (!s || s.status !== "confirming") return null;
  await event(db, id, "viewer", "Gate 1 passed: the commenter confirmed the change request.");
  return s;
}

export async function runPlan(db: DB, id: string, steps: Step[], onStep: () => Promise<void>, sleep: (ms: number) => Promise<void>) {
  for (const st of steps) {
    await sleep(st.delayMs);
    const cur = await getSuggestion(db, id);
    if (!cur || cur.status === "declined") return;
    await setStatus(db, id, st.status, { preview: st.preview, previewVideoUrl: st.previewVideoUrl });
    await event(db, id, st.actor, st.message);
    await onStep();
  }
}

/** Gate 2: the commenter watches the recording. "Looks right" sends it to the maker; "Not quite" starts another round. */
export async function reviewRecording(db: DB, s: SuggestionRow, verdict: "approve" | "revise", note = "") {
  if (s.status !== "preview_recorded") return null;
  if (verdict === "approve") {
    await setStatus(db, s.id, "sent");
    await event(db, s.id, "viewer", "Gate 2 passed: the commenter watched the recording and said it looks right. Sent to the maker.");
    return { round: s.round };
  }
  const round = s.round + 1;
  await db.run(sql`UPDATE suggestions SET status = 'queued', round = ${round}, feedback = ${note.slice(0, 500)}, updated_at = ${Date.now()} WHERE id = ${s.id}`);
  await event(db, s.id, "viewer", `Not quite: “${note.slice(0, 200)}”`);
  return { round };
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

/** Gate 3: the builder approves → pull request (test double in demo mode) whose body links the recording and credits the commenter. */
export async function adoptSuggestion(db: DB, sc: ShowcaseRow, s: SuggestionRow, suggesterName: string) {
  if (!["sent", "builder_review"].includes(s.status)) return null;
  const [row] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM suggestions WHERE discussion_id = ${sc.discussionId} AND pr_number IS NOT NULL`);
  const prNumber = 41 + (row?.n ?? 0);
  await setStatus(db, s.id, "pr_opened", { prNumber });
  await event(db, s.id, "builder", `Gate 3 passed: maker approved. PR #${prNumber} opened on ${sc.repoFullName} (demo test double — not sent to GitHub). PR body: “${s.title}”, preview recording ${s.previewVideoUrl ?? "(none)"}, suggested by ${suggesterName}.`);
  const pts = await awardPoints(db, sc, s, "adopted");
  return { prNumber, points: pts };
}

export async function markMerged(db: DB, sc: ShowcaseRow, s: SuggestionRow) {
  if (s.status !== "pr_opened") return null;
  await setStatus(db, s.id, "merged");
  await event(db, s.id, "builder", `PR #${s.prNumber} merged by the maker (simulated). CommonGround never merges on its own.`);
  return { points: await awardPoints(db, sc, s, "merged") };
}

export async function declineSuggestion(db: DB, s: SuggestionRow) {
  if (["pr_opened", "merged", "declined", "filtered"].includes(s.status)) return false;
  await setStatus(db, s.id, "declined");
  await event(db, s.id, "builder", "Maker declined this suggestion.");
  return true;
}

/** The builder overrides the filter: the comment becomes a change request and goes through all three gates. */
export async function restoreFiltered(db: DB, s: SuggestionRow) {
  if (s.status !== "filtered") return false;
  await db.run(sql`UPDATE suggestions SET status = 'confirming', quality = 'actionable', reason = ${`Restored by the maker (was: ${s.reason})`}, restated = CASE WHEN restated = '' THEN ${`Change requested in plain words: “${s.title}”.`} ELSE restated END, updated_at = ${Date.now()} WHERE id = ${s.id}`);
  await event(db, s.id, "builder", "Maker restored this comment from the filtered list.");
  return true;
}

export type Funnel = { comments: number; actionable: number; confirmed: number; recordingApproved: number; prOpened: number; merged: number; filtered: number };

/** Real counts for the builder's funnel. */
export async function funnel(db: DB, sc: ShowcaseRow): Promise<Funnel> {
  const [c] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM comments WHERE discussion_id = ${sc.discussionId} AND status = 'published' AND author_id != ${sc.builderId}`);
  const [r] = await db.all<Omit<Funnel, "comments">>(sql`SELECT
    COALESCE(SUM(CASE WHEN quality IN ('actionable','needs_builder') THEN 1 ELSE 0 END), 0) AS actionable,
    COALESCE(SUM(CASE WHEN status IN ('queued','running','reviewing','preview_recorded','sent','pr_opened','merged') THEN 1 ELSE 0 END), 0) AS confirmed,
    COALESCE(SUM(CASE WHEN status IN ('sent','pr_opened','merged') AND preview_video_url IS NOT NULL THEN 1 ELSE 0 END), 0) AS recordingApproved,
    COALESCE(SUM(CASE WHEN pr_number IS NOT NULL THEN 1 ELSE 0 END), 0) AS prOpened,
    COALESCE(SUM(CASE WHEN status = 'merged' THEN 1 ELSE 0 END), 0) AS merged,
    COALESCE(SUM(CASE WHEN status = 'filtered' THEN 1 ELSE 0 END), 0) AS filtered
    FROM suggestions WHERE discussion_id = ${sc.discussionId}`);
  const zero = { actionable: 0, confirmed: 0, recordingApproved: 0, prOpened: 0, merged: 0, filtered: 0 };
  return { comments: c?.n ?? 0, ...(r ?? zero) };
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
