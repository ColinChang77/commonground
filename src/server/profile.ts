"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { blocks, follows, interests, profiles, user, userSkills } from "@/db/schema";
import { ActionError, type ActionResult, fail, ok, run } from "@/lib/action";
import { getViewer } from "@/lib/session";
import { profileSchema } from "@/lib/validation";
import { ensureSkills } from "@/server/skills";
import { track } from "@/lib/analytics";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notify";

async function signedIn() {
  const v = await getViewer();
  if (!v) throw new ActionError("Please sign in first.");
  return v;
}

async function writeProfileExtras(userId: string, input: { interests: string[]; skills: string[] }) {
  const db = getDb();
  const skillIds = await ensureSkills(db, input.skills);
  await db.batch([
    db.delete(interests).where(eq(interests.userId, userId)),
    db.delete(userSkills).where(eq(userSkills.userId, userId)),
    ...(input.interests.length ? [db.insert(interests).values(input.interests.map((category) => ({ userId, category })))] : []),
    ...(skillIds.length ? [db.insert(userSkills).values(skillIds.map((skillId) => ({ userId, skillId })))] : []),
  ] as unknown as Parameters<typeof db.batch>[0]);
}

export async function saveProfile(raw: unknown): Promise<ActionResult<{ username: string }>> {
  return run(async () => {
    const v = await signedIn();
    if (!(await rateLimit(`profile:${v.id}`, 20, 60))) throw new ActionError("Slow down a little and try again.");
    const input = profileSchema.parse(raw);
    const db = getDb();
    const [taken] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(sql`lower(${profiles.username}) = ${input.username.toLowerCase()}`)
      .limit(1);
    if (taken && taken.userId !== v.id) return fail("That username is taken.", { username: "That username is taken." });

    const collabPrefs = JSON.stringify({ openTo: input.openTo, hoursPerWeek: input.hoursPerWeek ?? null });
    const isNew = !v.profile;
    if (isNew) {
      await db.insert(profiles).values({
        userId: v.id,
        username: input.username,
        displayName: input.displayName,
        bio: input.bio,
        avatarKey: input.avatarKey ?? null,
        collabPrefs,
        onboardedAt: new Date(),
      });
      await track(db, "user.signed_up", v.id);
    } else {
      await db
        .update(profiles)
        .set({
          username: input.username,
          displayName: input.displayName,
          bio: input.bio,
          avatarKey: input.avatarKey === undefined ? v.profile!.avatarKey : input.avatarKey,
          collabPrefs,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, v.id));
    }
    await db.update(user).set({ name: input.displayName, updatedAt: new Date() }).where(eq(user.id, v.id));
    await writeProfileExtras(v.id, { interests: input.interests, skills: input.skills });
    revalidatePath("/", "layout");
    return ok({ username: input.username }, isNew ? "Welcome to CommonGround!" : "Profile saved.");
  });
}

export async function toggleFollow(targetUserId: string): Promise<ActionResult<{ following: boolean }>> {
  return run(async () => {
    const v = await signedIn();
    if (!v.profile) throw new ActionError("Finish your profile first.");
    if (targetUserId === v.id) throw new ActionError("You can't follow yourself.");
    if (!(await rateLimit(`follow:${v.id}`, 60, 60))) throw new ActionError("Slow down a little.");
    const db = getDb();
    const [existing] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, v.id), eq(follows.followeeId, targetUserId)))
      .limit(1);
    if (existing) {
      await db.delete(follows).where(and(eq(follows.followerId, v.id), eq(follows.followeeId, targetUserId)));
    } else {
      const [target] = await db.select({ u: profiles.username }).from(profiles).where(eq(profiles.userId, targetUserId)).limit(1);
      if (!target) throw new ActionError("User not found.");
      await db.insert(follows).values({ followerId: v.id, followeeId: targetUserId }).onConflictDoNothing();
      await notify(db, [
        { userId: targetUserId, actorId: v.id, type: "mention", title: `${v.profile.displayName} followed you`, url: `/u/${v.profile.username}` },
      ]);
    }
    revalidatePath(`/u`, "layout");
    return ok({ following: !existing });
  });
}

export async function toggleBlock(targetUserId: string): Promise<ActionResult<{ blocked: boolean }>> {
  return run(async () => {
    const v = await signedIn();
    if (targetUserId === v.id) throw new ActionError("You can't block yourself.");
    const db = getDb();
    const [existing] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.blockerId, v.id), eq(blocks.blockedId, targetUserId)))
      .limit(1);
    if (existing) await db.delete(blocks).where(and(eq(blocks.blockerId, v.id), eq(blocks.blockedId, targetUserId)));
    else {
      await db.batch([
        db.insert(blocks).values({ blockerId: v.id, blockedId: targetUserId }).onConflictDoNothing(),
        db.delete(follows).where(and(eq(follows.followerId, v.id), eq(follows.followeeId, targetUserId))),
        db.delete(follows).where(and(eq(follows.followerId, targetUserId), eq(follows.followeeId, v.id))),
      ]);
    }
    revalidatePath("/", "layout");
    return ok({ blocked: !existing }, existing ? "Unblocked." : "Blocked. You won't see each other's posts or notifications.");
  });
}
