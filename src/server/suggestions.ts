"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb, createDb } from "@/db";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { getEnv } from "@/lib/env";
import { publishWith } from "@/lib/realtime";
import { canConfirmSuggestion, canDecideSuggestion } from "@/lib/permissions";
import { adoptSuggestion, confirmSuggestion, declineSuggestion, demoPlan, getShowcase, getSuggestion, markMerged, runPlan } from "@/lib/suggestions";
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

/** The commenter confirms the restated change; the agents then run in the background, every step pushed live. */
export async function confirmChange(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("suggestion-confirm", 20, 600);
    const { db, s, sc } = await load(id);
    if (!canConfirmSuggestion(v.id, s.authorId)) throw new ActionError("Only the person who made this suggestion can confirm it.");
    if (sc.paused) throw new ActionError("The maker paused new suggestions for now.");
    if (!(await confirmSuggestion(db, id))) throw new ActionError("This suggestion was already confirmed.");
    const env = getEnv();
    const room = `d:${s.discussionId}`;
    await publishWith(env, room, { kind: "refresh" });
    after(async () => {
      const bg = createDb(env.DB);
      await runPlan(bg, id, demoPlan(s, sc.repoFullName), () => publishWith(env, room, { kind: "refresh" }), (ms) => new Promise((r) => setTimeout(r, ms)));
      await notify(bg, [{ userId: sc.builderId, actorId: s.authorId, type: "approval_request", title: `New change request ready: ${s.title}`, url: `/d/${s.discussionId}`, projectId: null }]);
    });
    revalidatePath(`/d/${s.discussionId}`);
    return ok(null, "Confirmed — the AI helpers are on it.");
  });
}

export async function decideChange(id: string, decision: "adopt" | "decline" | "merge"): Promise<ActionResult<{ points: number }>> {
  return run(async () => {
    const v = await activeViewer("suggestion-decide", 30, 600);
    const { db, s, sc } = await load(id);
    if (!canDecideSuggestion(v.id, sc.builderId)) throw new ActionError("Only the maker of this project can decide on suggestions.");
    let points = 0;
    if (decision === "adopt") {
      const r = await adoptSuggestion(db, sc, s);
      if (!r) throw new ActionError("This suggestion isn't ready to adopt yet.");
      points = r.points;
      await notify(db, [{ userId: s.authorId, actorId: v.id, type: "contribution_verified", title: `${v.profile.displayName} adopted your suggestion “${s.title}” (+${r.points} points)`, url: `/d/${s.discussionId}`, projectId: null }]);
    } else if (decision === "merge") {
      const r = await markMerged(db, sc, s);
      if (!r) throw new ActionError("Only an open pull request can be marked merged.");
      points = r.points;
    } else if (!(await declineSuggestion(db, s))) throw new ActionError("This suggestion can't be declined anymore.");
    await audit(db, { actorId: v.id, action: `suggestion.${decision}`, entityType: "suggestion", entityId: id, metadata: { points } });
    await publishWith(getEnv(), `d:${s.discussionId}`, { kind: "refresh" });
    revalidatePath(`/d/${s.discussionId}`);
    return ok({ points }, decision === "adopt" ? "Pull request opened (demo)." : decision === "merge" ? "Marked merged." : "Declined.");
  });
}
