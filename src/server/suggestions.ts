"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, createDb } from "@/db";
import { profiles } from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { getEnv, type AppEnv } from "@/lib/env";
import { publishWith } from "@/lib/realtime";
import { canConfirmSuggestion, canDecideSuggestion } from "@/lib/permissions";
import { adoptSuggestion, confirmSuggestion, declineSuggestion, demoPlan, getShowcase, getSuggestion, markMerged, restoreFiltered, reviewRecording, runPlan, type ShowcaseRow, type SuggestionRow } from "@/lib/suggestions";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";

async function load(id: string) {
  const db = getDb();
  const s = await getSuggestion(db, id);
  if (!s) throw new ActionError("Suggestion not found.");
  const sc = await getShowcase(db, s.discussionId);
  if (!sc) throw new ActionError("Suggestion not found.");
  return { db, s, sc };
}

/** Runs one round of the (demo) agents in the background; every step is pushed live to everyone on the thread. */
function startRound(env: AppEnv, s: SuggestionRow, sc: ShowcaseRow, round: number) {
  const room = `d:${s.discussionId}`;
  after(async () => {
    const bg = createDb(env.DB);
    await runPlan(bg, s.id, demoPlan(s, sc.repoFullName, round), () => publishWith(env, room, { kind: "refresh" }), (ms) => new Promise((r) => setTimeout(r, ms)));
  });
}

/** Gate 1: the commenter confirms the restated change. */
export async function confirmChange(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("suggestion-confirm", 20, 600);
    const { db, s, sc } = await load(id);
    if (!canConfirmSuggestion(v.id, s.authorId)) throw new ActionError("Only the person who made this suggestion can confirm it.");
    if (sc.paused) throw new ActionError("The maker paused new suggestions for now.");
    if (!(await confirmSuggestion(db, id))) throw new ActionError("This suggestion was already confirmed.");
    const env = getEnv();
    await publishWith(env, `d:${s.discussionId}`, { kind: "refresh" });
    startRound(env, s, sc, 1);
    revalidatePath(`/d/${s.discussionId}`);
    return ok(null, "Confirmed — the AI helpers are on it.");
  });
}

/** Gate 2: the commenter reviews the screen recording, not the code. */
export async function reviewPreview(id: string, verdict: "approve" | "revise", note = ""): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("suggestion-review", 20, 600);
    const { db, s, sc } = await load(id);
    if (!canConfirmSuggestion(v.id, s.authorId)) throw new ActionError("Only the person who made this suggestion can review the recording.");
    if (verdict === "revise" && note.trim().length < 3) throw new ActionError("Say in a few words what should change.");
    const r = await reviewRecording(db, s, verdict, note.trim());
    if (!r) throw new ActionError("There's no recording waiting for your review.");
    const env = getEnv();
    if (verdict === "approve") await notify(db, [{ userId: sc.builderId, actorId: v.id, type: "approval_request", title: `Ready for your approval: ${s.title}`, url: `/d/${s.discussionId}/suggestions`, projectId: null }]);
    else startRound(env, s, sc, r.round);
    await publishWith(env, `d:${s.discussionId}`, { kind: "refresh" });
    revalidatePath(`/d/${s.discussionId}`);
    return ok(null, verdict === "approve" ? "Sent to the maker." : "Got it — trying again.");
  });
}

/** Gate 3 and the builder's other decisions. */
export async function decideChange(id: string, decision: "adopt" | "decline" | "merge" | "restore"): Promise<ActionResult<{ points: number }>> {
  return run(async () => {
    const v = await activeViewer("suggestion-decide", 30, 600);
    const { db, s, sc } = await load(id);
    if (!canDecideSuggestion(v.id, sc.builderId)) throw new ActionError("Only the maker of this project can decide on suggestions.");
    let points = 0;
    if (decision === "adopt") {
      const [p] = await db.select({ n: profiles.displayName }).from(profiles).where(eq(profiles.userId, s.authorId)).limit(1);
      const r = await adoptSuggestion(db, sc, s, p?.n ?? "a viewer");
      if (!r) throw new ActionError("This suggestion hasn't passed the earlier checks yet.");
      points = r.points;
      await notify(db, [{ userId: s.authorId, actorId: v.id, type: "contribution_verified", title: `${v.profile.displayName} adopted your suggestion “${s.title}” (+${r.points} points)`, url: `/d/${s.discussionId}`, projectId: null }]);
    } else if (decision === "merge") {
      const r = await markMerged(db, sc, s);
      if (!r) throw new ActionError("Only an open pull request can be marked merged.");
      points = r.points;
    } else if (decision === "restore") {
      if (!(await restoreFiltered(db, s))) throw new ActionError("Only filtered comments can be restored.");
    } else if (!(await declineSuggestion(db, s))) throw new ActionError("This suggestion can't be declined anymore.");
    await audit(db, { actorId: v.id, action: `suggestion.${decision}`, entityType: "suggestion", entityId: id, metadata: { points } });
    await publishWith(getEnv(), `d:${s.discussionId}`, { kind: "refresh" });
    revalidatePath(`/d/${s.discussionId}`);
    revalidatePath(`/d/${s.discussionId}/suggestions`);
    const msg = { adopt: "Pull request opened (demo).", merge: "Marked merged.", restore: "Restored — the commenter will be asked to confirm.", decline: "Declined." }[decision];
    return ok({ points }, msg);
  });
}
