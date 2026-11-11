"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { ActionError, type ActionResult, ok, run } from "@/lib/action";
import { getViewer } from "@/lib/session";

export async function markNotificationsRead(ids: string[] | "all"): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await getViewer();
    if (!v) throw new ActionError("Please sign in.");
    const db = getDb();
    const now = new Date();
    if (ids === "all") await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, v.id), isNull(notifications.readAt)));
    else for (const id of ids.slice(0, 100)) await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.id, id), eq(notifications.userId, v.id)));
    revalidatePath("/", "layout");
    return ok(null);
  });
}
