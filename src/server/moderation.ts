"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { comments, discussions, moderationActions, opportunities, profiles, projects, reports, session } from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { reportSchema } from "@/lib/validation";
import { newId } from "@/lib/ids";
import { getViewer, isStaff } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function submitReport(raw: unknown): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("report", 10, 3600);
    const input = reportSchema.parse(raw);
    const db = getDb();
    const inserted = await db
      .insert(reports)
      .values({ id: newId(), reporterId: v.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details })
      .onConflictDoNothing()
      .returning({ id: reports.id });
    return ok(null, inserted.length ? "Thanks — our moderators will take a look." : "You've already reported this. Moderators will review it.");
  });
}

async function staff() {
  const v = await getViewer();
  if (!v || !isStaff(v)) throw new ActionError("Not authorized.");
  return v;
}

const actionSchema = z.object({
  reportId: z.string().uuid().optional(),
  targetType: z.enum(["discussion", "comment", "project", "user", "opportunity"]),
  targetId: z.string().min(1).max(64),
  action: z.enum(["remove", "dismiss", "suspend", "unsuspend", "restore"]),
  reason: z.string().trim().max(500).default(""),
});

export async function moderate(raw: unknown): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await staff();
    const input = actionSchema.parse(raw);
    const db = getDb();
    const now = new Date();
    switch (input.action) {
      case "remove":
        if (input.targetType === "discussion") await db.update(discussions).set({ status: "removed" }).where(eq(discussions.id, input.targetId));
        else if (input.targetType === "comment") await db.update(comments).set({ status: "removed", body: "" }).where(eq(comments.id, input.targetId));
        else if (input.targetType === "opportunity") await db.update(opportunities).set({ status: "closed" }).where(eq(opportunities.id, input.targetId));
        else if (input.targetType === "project") await db.update(projects).set({ visibility: "private", status: "archived" }).where(eq(projects.id, input.targetId));
        else throw new ActionError("Use suspend for accounts.");
        break;
      case "restore":
        if (input.targetType === "discussion") await db.update(discussions).set({ status: "published" }).where(eq(discussions.id, input.targetId));
        else throw new ActionError("Only discussions can be restored.");
        break;
      case "suspend": {
        if (input.targetType !== "user") throw new ActionError("Only accounts can be suspended.");
        if (input.targetId === v.id) throw new ActionError("You can't suspend yourself.");
        const [target] = await db.select().from(profiles).where(eq(profiles.userId, input.targetId)).limit(1);
        if (!target) throw new ActionError("User not found.");
        if (target.platformRole === "admin") throw new ActionError("Admins can't be suspended here.");
        await db.batch([
          db.update(profiles).set({ suspendedAt: now, suspendedReason: input.reason || "Community Guidelines violation" }).where(eq(profiles.userId, input.targetId)),
          db.delete(session).where(eq(session.userId, input.targetId)),
        ]);
        break;
      }
      case "unsuspend":
        await db.update(profiles).set({ suspendedAt: null, suspendedReason: null }).where(eq(profiles.userId, input.targetId));
        break;
      case "dismiss":
        break;
    }
    await db.insert(moderationActions).values({ id: newId(), moderatorId: v.id, targetType: input.targetType, targetId: input.targetId, action: input.action, reason: input.reason, reportId: input.reportId ?? null });
    if (input.reportId || input.action !== "unsuspend") {
      await db
        .update(reports)
        .set({ status: input.action === "dismiss" ? "dismissed" : "resolved", resolvedBy: v.id, resolvedAt: now })
        .where(and(eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.status, "open")));
    }
    await audit(db, { actorId: v.id, action: `moderation.${input.action}`, entityType: input.targetType, entityId: input.targetId, metadata: { reason: input.reason } });
    revalidatePath("/admin");
    return ok(null, "Done.");
  });
}
