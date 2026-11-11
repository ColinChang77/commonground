import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { discussions } from "@/db/schema";
import { getViewer } from "@/lib/session";
import { getEnv } from "@/lib/env";
import { getProjectAccess } from "@/lib/authz";
import { canSeeDiscussion } from "@/server/guards";
import { mintTicket, realtimeUrl } from "@/lib/realtime";

/** Issues a 2-minute ticket for one realtime room, only if the viewer may see that project/discussion. */
export async function GET(req: Request) {
  const room = new URL(req.url).searchParams.get("room") ?? "";
  const m = /^(p|d):([0-9a-f-]{36})$/.exec(room);
  if (!m) return Response.json({ error: "Bad room" }, { status: 400 });
  const viewer = await getViewer();
  if (!viewer?.profile) return Response.json({ error: "Sign in" }, { status: 401 });
  const db = getDb();
  if (m[1] === "p") {
    const access = await getProjectAccess({ id: m[2] }, viewer.id, db);
    if (!access?.can("project.view")) return Response.json({ error: "Not found" }, { status: 404 });
  } else {
    const [d] = await db.select().from(discussions).where(eq(discussions.id, m[2])).limit(1);
    if (!d || !(await canSeeDiscussion(db, d, viewer.id))) return Response.json({ error: "Not found" }, { status: 404 });
  }
  const env = getEnv();
  const ticket = await mintTicket(env, room, { uid: viewer.id, name: viewer.profile.displayName, avatar: viewer.profile.avatarKey });
  const base = realtimeUrl(env);
  if (!ticket || !base) return Response.json({ error: "Realtime not configured" }, { status: 503 });
  return Response.json({ url: `${base.replace(/^http/, "ws")}/connect?ticket=${encodeURIComponent(ticket)}` }, { headers: { "Cache-Control": "no-store" } });
}
