import "server-only";
import { and, eq, or } from "drizzle-orm";
import type { DB } from "@/db";
import { blocks, discussions, media } from "@/db/schema";
import { ActionError } from "@/lib/action";
import { getProjectAccess } from "@/lib/authz";

export async function assertNotBlocked(db: DB, a: string, b: string) {
  if (a === b) return;
  const [row] = await db
    .select()
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))))
    .limit(1);
  if (row) throw new ActionError("You can't interact with this person.");
}

export async function assertOwnMedia(db: DB, userId: string, key: string) {
  const [m] = await db.select().from(media).where(and(eq(media.key, key), eq(media.ownerId, userId))).limit(1);
  if (!m) throw new ActionError("That image upload wasn't found. Please upload it again.");
}

/** Project-scoped discussions inherit the project's visibility. */
export async function canSeeDiscussion(db: DB, d: typeof discussions.$inferSelect, viewerId: string | null) {
  if (!d.projectId) return true;
  const access = await getProjectAccess({ id: d.projectId }, viewerId, db);
  return Boolean(access?.can("project.view"));
}
