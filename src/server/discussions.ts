"use server";
import { recordActivity } from "@/lib/activity";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { bookmarks, comments, discussions, interests, profiles, reactions, votes } from "@/db/schema";
import { publish } from "@/lib/realtime";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { commentSchema, discussionSchema } from "@/lib/validation";
import { newId } from "@/lib/ids";
import { extractMentions, notify, type NotificationInput } from "@/lib/notify";
import { assertProject } from "@/lib/authz";
import { track } from "@/lib/analytics";
import { excerpt } from "@/lib/markdown";
import { audit } from "@/lib/audit";
import { isStaff } from "@/lib/session";
import { assertNotBlocked, assertOwnMedia, canSeeDiscussion } from "@/server/guards";
import { CATEGORIES, REACTIONS, type ReactionKind } from "@/lib/constants";
import { looksLikeSpam } from "@/lib/spam";

export async function createDiscussion(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("post", 6, 600);
    const input = discussionSchema.parse(raw);
    if (looksLikeSpam(`${input.title}\n${input.body}`)) throw new ActionError("This post looks like spam (too many links or repeated text). Edit it and try again.");
    const db = getDb();
    if (input.projectId) await assertProject(input.projectId, v.id, "discussion.post", db);
    if (input.imageKey) await assertOwnMedia(db, v.id, input.imageKey);
    const id = newId();
    await db.insert(discussions).values({
      id,
      authorId: v.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      category: input.category,
      imageKey: input.imageKey ?? null,
      projectId: input.projectId ?? null,
      score: 1,
    });
    await db.insert(votes).values({ userId: v.id, discussionId: id, value: 1 });
    await notifyMentions(v, input.body, `/d/${id}`, input.title);
    await track(db, "discussion.created", v.id, { kind: input.kind, category: input.category, inProject: Boolean(input.projectId) });
    revalidatePath("/");
    return ok({ id }, "Posted.");
  });
}

async function notifyMentions(v: { id: string; profile: { displayName: string } }, body: string, url: string, title: string, exclude: string[] = []) {
  const names = extractMentions(body);
  if (!names.length) return;
  const db = getDb();
  const rows = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(inArray(sql`lower(${profiles.username})`, names));
  await notify(
    db,
    rows
      .filter((r) => !exclude.includes(r.userId))
      .map((r) => ({ userId: r.userId, actorId: v.id, type: "mention" as const, title: `${v.profile.displayName} mentioned you`, body: title, url })),
  );
}

export async function editDiscussion(raw: { id: string; title: string; body: string }): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("post-edit", 20, 600);
    const input = discussionSchema.pick({ title: true, body: true }).parse(raw);
    const db = getDb();
    const [d] = await db.select().from(discussions).where(eq(discussions.id, raw.id)).limit(1);
    if (!d || d.status !== "published") throw new ActionError("Post not found.");
    if (d.authorId !== v.id) throw new ActionError("You can only edit your own posts.");
    await db.update(discussions).set({ title: input.title, body: input.body, updatedAt: new Date() }).where(eq(discussions.id, d.id));
    revalidatePath(`/d/${d.id}`);
    return ok(null, "Saved.");
  });
}

export async function deleteDiscussion(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("post-delete", 20, 600);
    const db = getDb();
    const [d] = await db.select().from(discussions).where(eq(discussions.id, id)).limit(1);
    if (!d) throw new ActionError("Post not found.");
    const staff = isStaff(v);
    if (d.authorId !== v.id && !staff) throw new ActionError("You can only delete your own posts.");
    if (d.convertedProjectId) {
      // Preserve the history that a project was born from.
      throw new ActionError("This discussion became a project, so it's kept as part of the project's history.");
    }
    await db.delete(discussions).where(eq(discussions.id, id));
    await audit(db, { actorId: v.id, action: staff && d.authorId !== v.id ? "moderation.delete_discussion" : "discussion.delete", entityType: "discussion", entityId: id });
    revalidatePath("/");
    return ok(null, "Deleted.");
  });
}

export async function addComment(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const v = await activeViewer("comment", 20, 300);
    const input = commentSchema.parse(raw);
    if (looksLikeSpam(input.body)) throw new ActionError("This comment looks like spam. Edit it and try again.");
    const db = getDb();
    const [d] = await db.select().from(discussions).where(eq(discussions.id, input.discussionId)).limit(1);
    if (!d || d.status !== "published" || !(await canSeeDiscussion(db, d, v.id))) throw new ActionError("Post not found.");
    await assertNotBlocked(db, v.id, d.authorId);

    let parentAuthor: string | null = null;
    if (input.parentId) {
      const [parent] = await db.select().from(comments).where(eq(comments.id, input.parentId)).limit(1);
      if (!parent || parent.discussionId !== d.id) throw new ActionError("The comment you're replying to no longer exists.");
      // Keep threads readable: replies to replies attach to the same top-level thread.
      if (parent.parentId) input.parentId = parent.parentId;
      parentAuthor = parent.authorId;
    }
    const id = newId();
    await db.batch([
      db.insert(comments).values({ id, discussionId: d.id, authorId: v.id, parentId: input.parentId ?? null, body: input.body }),
      db
        .update(discussions)
        .set({ commentCount: sql`(SELECT count(*) FROM comments WHERE discussion_id = ${d.id} AND status = 'published')`, lastActivityAt: new Date() })
        .where(eq(discussions.id, d.id)),
    ]);
    const url = `/d/${d.id}#c-${id}`;
    const items: NotificationInput[] = [];
    if (parentAuthor) items.push({ userId: parentAuthor, actorId: v.id, type: "reply", title: `${v.profile.displayName} replied to your comment`, body: excerpt(input.body, 140), url, projectId: d.projectId });
    if (d.authorId !== parentAuthor)
      items.push({ userId: d.authorId, actorId: v.id, type: "comment", title: `${v.profile.displayName} commented on “${d.title}”`, body: excerpt(input.body, 140), url, projectId: d.projectId });
    await notify(db, items);
    await notifyMentions(v, input.body, url, d.title, [d.authorId, parentAuthor ?? ""]);
    await publish(`d:${d.id}`, { kind: "comment", discussionId: d.id, commentId: id });
    const projectId = d.projectId ?? d.convertedProjectId;
    if (projectId) {
      await recordActivity(db, { projectId, actorId: v.id, kind: "comment", message: `${v.profile.displayName} replied in “${d.title}”: ${excerpt(input.body, 90)}`, url: `/d/${d.id}#c-${id}` });
    }
    revalidatePath(`/d/${d.id}`);
    return ok({ id });
  });
}

export async function deleteComment(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("comment-delete", 30, 300);
    const db = getDb();
    const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    if (!c) throw new ActionError("Comment not found.");
    if (c.authorId !== v.id && !isStaff(v)) throw new ActionError("You can only delete your own comments.");
    // Soft-delete so reply threads keep their shape.
    await db.batch([
      db.update(comments).set({ status: "removed", body: "", updatedAt: new Date() }).where(eq(comments.id, id)),
      db
        .update(discussions)
        .set({ commentCount: sql`(SELECT count(*) FROM comments WHERE discussion_id = ${c.discussionId} AND status = 'published')` })
        .where(eq(discussions.id, c.discussionId)),
    ]);
    if (c.authorId !== v.id) await audit(db, { actorId: v.id, action: "moderation.remove_comment", entityType: "comment", entityId: id });
    revalidatePath(`/d/${c.discussionId}`);
    return ok(null, "Comment deleted.");
  });
}

export async function toggleReaction(discussionId: string, kind: ReactionKind): Promise<ActionResult<{ active: boolean; count: number }>> {
  return run(async () => {
    const v = await activeViewer("react", 120, 60);
    if (!REACTIONS.some((r) => r.id === kind)) throw new ActionError("Unknown reaction.");
    const db = getDb();
    const [d] = await db.select().from(discussions).where(eq(discussions.id, discussionId)).limit(1);
    if (!d || d.status !== "published" || !(await canSeeDiscussion(db, d, v.id))) throw new ActionError("Post not found.");
    const key = and(eq(reactions.userId, v.id), eq(reactions.targetType, "discussion"), eq(reactions.targetId, discussionId), eq(reactions.kind, kind));
    const [existing] = await db.select().from(reactions).where(key).limit(1);
    const recount = db
      .update(discussions)
      .set({ reactionCount: sql`(SELECT count(*) FROM reactions WHERE target_type = 'discussion' AND target_id = ${discussionId})` })
      .where(eq(discussions.id, discussionId));
    if (existing) await db.batch([db.delete(reactions).where(key), recount]);
    else await db.batch([db.insert(reactions).values({ userId: v.id, targetType: "discussion", targetId: discussionId, kind }).onConflictDoNothing(), recount]);
    const [row] = await db.select({ n: discussions.reactionCount }).from(discussions).where(eq(discussions.id, discussionId));
    return ok({ active: !existing, count: row?.n ?? 0 });
  });
}

export async function toggleBookmark(discussionId: string): Promise<ActionResult<{ bookmarked: boolean }>> {
  return run(async () => {
    const v = await activeViewer("bookmark", 120, 60);
    const db = getDb();
    const [d] = await db.select().from(discussions).where(eq(discussions.id, discussionId)).limit(1);
    if (!d || !(await canSeeDiscussion(db, d, v.id))) throw new ActionError("Post not found.");
    const key = and(eq(bookmarks.userId, v.id), eq(bookmarks.discussionId, discussionId));
    const [existing] = await db.select().from(bookmarks).where(key).limit(1);
    if (existing) await db.delete(bookmarks).where(key);
    else await db.insert(bookmarks).values({ userId: v.id, discussionId }).onConflictDoNothing();
    revalidatePath("/settings/bookmarks");
    return ok({ bookmarked: !existing }, existing ? "Removed from saved." : "Saved.");
  });
}

/** Sets the caller's vote to exactly `target` (1, -1, or 0 = no vote). Idempotent, so retries and reordering are safe. */
export async function vote(discussionId: string, target: 1 | -1 | 0): Promise<ActionResult<{ score: number; myVote: number }>> {
  return run(async () => {
    const v = await activeViewer("vote", 120, 60);
    if (target !== 1 && target !== -1 && target !== 0) throw new ActionError("Invalid vote.");
    const db = getDb();
    const [d] = await db.select().from(discussions).where(eq(discussions.id, discussionId)).limit(1);
    if (!d || d.status !== "published" || !(await canSeeDiscussion(db, d, v.id))) throw new ActionError("Post not found.");
    const key = and(eq(votes.userId, v.id), eq(votes.discussionId, discussionId));
    const recount = db
      .update(discussions)
      .set({ score: sql`(SELECT COALESCE(SUM(value), 0) FROM votes WHERE discussion_id = ${discussionId})` })
      .where(eq(discussions.id, discussionId));
    if (target === 0) await db.batch([db.delete(votes).where(key), recount]);
    else
      await db.batch([
        db.insert(votes).values({ userId: v.id, discussionId, value: target }).onConflictDoUpdate({ target: [votes.userId, votes.discussionId], set: { value: target } }),
        recount,
      ]);
    const [row] = await db.select({ score: discussions.score }).from(discussions).where(eq(discussions.id, discussionId));
    return ok({ score: row?.score ?? 0, myVote: target });
  });
}

/** Joining a community = adding it to your interests (shapes your Home feed). */
export async function toggleCommunity(categoryId: string): Promise<ActionResult<{ joined: boolean }>> {
  return run(async () => {
    const v = await activeViewer("community", 60, 60);
    if (!CATEGORIES.some((c) => c.id === categoryId)) throw new ActionError("Unknown community.");
    const db = getDb();
    const key = and(eq(interests.userId, v.id), eq(interests.category, categoryId));
    const [existing] = await db.select().from(interests).where(key).limit(1);
    if (existing) await db.delete(interests).where(key);
    else await db.insert(interests).values({ userId: v.id, category: categoryId }).onConflictDoNothing();
    revalidatePath("/", "layout");
    return ok({ joined: !existing });
  });
}
