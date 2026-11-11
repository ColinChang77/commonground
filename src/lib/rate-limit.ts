import "server-only";
import { getEnv } from "@/lib/env";

/**
 * Fixed-window counter in D1. Returns true if the call is allowed.
 * Single atomic UPSERT … RETURNING so concurrent requests can't both slip through the boundary.
 */
export async function rateLimit(key: string, limit: number, windowSec: number, d1: D1Database = getEnv().DB) {
  const now = Date.now();
  const windowStart = now - (now % (windowSec * 1000));
  const row = await d1
    .prepare(
      `INSERT INTO app_rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN app_rate_limits.window_start < ?2 THEN 1 ELSE app_rate_limits.count + 1 END,
         window_start = CASE WHEN app_rate_limits.window_start < ?2 THEN ?2 ELSE app_rate_limits.window_start END
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}
