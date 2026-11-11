import { getDb } from "@/db";
import { githubConfig } from "@/lib/github/config";
import { processWebhook, verifySignature } from "@/lib/github/webhooks";
import { notify } from "@/lib/notify";
import { recordActivity } from "@/lib/activity";

export async function POST(req: Request) {
  const cfg = githubConfig();
  if (!cfg) return Response.json({ error: "GitHub App not configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 5_000_000) return Response.json({ error: "Payload too large" }, { status: 413 });
  if (!(await verifySignature(cfg.webhookSecret, raw, req.headers.get("x-hub-signature-256")))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  const delivery = req.headers.get("x-github-delivery");
  const event = req.headers.get("x-github-event");
  if (!delivery || !event) return Response.json({ error: "Missing GitHub headers" }, { status: 400 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  const outcome = await processWebhook(db, delivery, event, payload, {
    onNotify: (n) => notify(db, [{ userId: n.userId, actorId: null, type: "pull_request", title: n.title, url: n.url, projectId: n.projectId }]),
    onActivity: (a) => recordActivity(db, { projectId: a.projectId, actorId: null, kind: "github", message: a.message, taskId: a.taskId }),
  });
  return Response.json(outcome);
}
