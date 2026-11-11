import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { b64url, hmacSha256Hex } from "@/lib/crypto";
import { isProduction, secret, type AppEnv } from "@/lib/env";

export type RealtimeEvent =
  | { kind: "activity"; item: ActivityItem }
  | { kind: "task"; taskId: string; status: string }
  | { kind: "comment"; discussionId: string; commentId: string }
  | { kind: "agent"; runId: string; taskId: string | null; status: string; message: string }
  | { kind: "refresh" };

export type ActivityItem = { id: string; kind: string; message: string; url: string | null; actorName: string | null; actorAvatar: string | null; createdAt: number };

function hexToBytes(h: string) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Signs a short-lived ticket the realtime worker accepts for one room. */
export async function mintTicket(env: AppEnv, room: string, user: { uid: string; name: string; avatar: string | null }) {
  const key = secret("REALTIME_SECRET" as keyof AppEnv, env);
  if (!key) return null;
  const body = b64url(new TextEncoder().encode(JSON.stringify({ room, ...user, exp: Math.floor(Date.now() / 1000) + 120 })));
  const sig = b64url(hexToBytes(await hmacSha256Hex(key, body)));
  return `${body}.${sig}`;
}

export function realtimeUrl(env: AppEnv) {
  return (env as unknown as { REALTIME_URL?: string }).REALTIME_URL ?? null;
}

/** Fire-and-forget broadcast. Never throws — a realtime hiccup must not break a user action. */
export async function publish(room: string, event: RealtimeEvent) {
  try {
    const { env, ctx } = getCloudflareContext();
    const key = secret("REALTIME_SECRET" as keyof AppEnv, env);
    if (!key) return;
    const init: RequestInit = { method: "POST", headers: { "content-type": "application/json", "x-realtime-secret": key }, body: JSON.stringify({ room, event }) };
    const binding = (env as unknown as { REALTIME?: Fetcher }).REALTIME;
    const base = realtimeUrl(env);
    // Production: service binding (workers.dev → workers.dev fetches aren't allowed). Dev: plain HTTP to `wrangler dev`.
    const p = isProduction(env) && binding ? binding.fetch("https://realtime/publish", init) : base ? fetch(`${base}/publish`, init) : null;
    if (p) ctx.waitUntil(p.then(() => undefined).catch((e) => console.warn("[realtime] publish failed", String(e))));
  } catch {
    /* outside a request context */
  }
}
