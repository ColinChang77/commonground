import "server-only";
import type { DB } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";

export async function audit(
  db: DB,
  e: {
    actorId: string | null;
    via?: "web" | "mcp" | "github" | "system";
    action: string;
    entityType: string;
    entityId: string;
    projectId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(auditLogs).values({
    id: newId(),
    actorId: e.actorId,
    via: e.via ?? "web",
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    projectId: e.projectId ?? null,
    metadata: JSON.stringify(e.metadata ?? {}),
  });
}
