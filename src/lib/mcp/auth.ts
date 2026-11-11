import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { mcpTokens, profiles } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";

export type McpPrincipal = {
  tokenId: string;
  userId: string;
  displayName: string;
  scopes: Set<"read" | "write">;
  /** null = every project the user belongs to */
  projectIds: Set<string> | null;
};

export async function authenticateMcp(db: DB, authHeader: string | null): Promise<McpPrincipal | null> {
  const m = /^Bearer\s+(cg_mcp_[A-Za-z0-9_-]{20,})$/.exec(authHeader ?? "");
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  const [row] = await db
    .select({ t: mcpTokens, displayName: profiles.displayName, suspendedAt: profiles.suspendedAt })
    .from(mcpTokens)
    .innerJoin(profiles, eq(profiles.userId, mcpTokens.userId))
    .where(and(eq(mcpTokens.tokenHash, hash), isNull(mcpTokens.revokedAt)))
    .limit(1);
  if (!row || row.suspendedAt) return null;
  if (row.t.expiresAt && row.t.expiresAt.getTime() < Date.now()) return null;
  const scopes = new Set(JSON.parse(row.t.scopes) as ("read" | "write")[]);
  return {
    tokenId: row.t.id,
    userId: row.t.userId,
    displayName: row.displayName,
    scopes,
    projectIds: row.t.projectIds ? new Set(JSON.parse(row.t.projectIds) as string[]) : null,
  };
}
