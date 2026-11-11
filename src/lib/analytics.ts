import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DB } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { newId } from "@/lib/ids";
import { secret } from "@/lib/env";

/**
 * Product analytics. Events are stored in D1 (source of truth for the North Star metric)
 * and forwarded to PostHog when POSTHOG_KEY is configured. Human-collaboration and AI-execution
 * events use separate prefixes (`collab.*` vs `agent.*`) so they never mix in dashboards.
 */
export type EventName =
  | "user.signed_up"
  | "user.activated"
  | "discussion.created"
  | "project.created_from_discussion"
  | "project.created"
  | "collab.application_submitted"
  | "collab.application_accepted"
  | "collab.contribution_verified"
  | "collab.project_completed"
  | "agent.run_started"
  | "agent.run_succeeded"
  | "agent.mcp_tool_called"
  | "github.pr_opened"
  | "github.pr_merged";

export async function track(db: DB, name: EventName, userId: string | null, properties: Record<string, unknown> = {}) {
  await db.insert(analyticsEvents).values({ id: newId(), name, userId, properties: JSON.stringify(properties) });
  try {
    const { env, ctx } = getCloudflareContext();
    const key = secret("POSTHOG_KEY", env);
    if (!key) return;
    const host = (secret("POSTHOG_HOST", env) ?? "https://us.i.posthog.com").replace(/\/$/, "");
    ctx.waitUntil(
      fetch(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, event: name, distinct_id: userId ?? "anonymous", properties }),
      }).catch(() => undefined),
    );
  } catch {
    /* analytics must never break a request */
  }
}
