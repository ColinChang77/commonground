/**
 * CommonGround realtime service.
 *
 *  GET  /connect?ticket=…   WebSocket upgrade. The ticket is minted by the main app after it checks
 *                           project/discussion access, and signed with REALTIME_SECRET (HMAC-SHA256).
 *  POST /publish            Server-to-server only (header x-realtime-secret). Broadcasts an event to a room.
 *
 * One Durable Object per room ("p:<projectId>" or "d:<discussionId>"). Uses the WebSocket Hibernation API,
 * so idle rooms cost nothing. Presence is derived from live sockets only — never stored or simulated.
 */
import { DurableObject } from "cloudflare:workers";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  REALTIME_SECRET: string;
}

type Ticket = { room: string; uid: string; name: string; avatar: string | null; exp: number };
type Attachment = { uid: string; name: string; avatar: string | null; focus: string | null; since: number };

const enc = new TextEncoder();
const b64urlToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function verifyTicket(token: string, secret: string): Promise<Ticket | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), enc.encode(body));
  if (!ok) return null;
  const t = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as Ticket;
  if (!t.room || !t.uid || t.exp < Date.now() / 1000) return null;
  if (!/^(p|d):[0-9a-f-]{36}$/.test(t.room)) return null;
  return t;
}

function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/connect") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      const ticket = await verifyTicket(url.searchParams.get("ticket") ?? "", env.REALTIME_SECRET);
      if (!ticket) return new Response("Invalid ticket", { status: 401 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(ticket.room));
      const fwd = new Request(req);
      fwd.headers.set("x-cg-user", JSON.stringify({ uid: ticket.uid, name: ticket.name, avatar: ticket.avatar }));
      return stub.fetch(fwd);
    }
    if (url.pathname === "/publish" && req.method === "POST") {
      if (!safeEq(req.headers.get("x-realtime-secret") ?? "", env.REALTIME_SECRET)) return new Response("Forbidden", { status: 403 });
      const { room, event } = (await req.json()) as { room: string; event: unknown };
      if (!/^(p|d):[0-9a-f-]{36}$/.test(room ?? "")) return new Response("Bad room", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch("https://room/broadcast", { method: "POST", body: JSON.stringify(event) });
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("Not found", { status: 404 });
  },
};

export class Room extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/broadcast") {
      const event = await req.json();
      this.send({ type: "event", event });
      return new Response("ok");
    }
    const user = JSON.parse(req.headers.get("x-cg-user") ?? "{}") as Omit<Attachment, "focus" | "since">;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [user.uid]);
    server.serializeAttachment({ ...user, focus: null, since: Date.now() } satisfies Attachment);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    let msg: { type?: string; focus?: unknown };
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === "focus") {
      const a = ws.deserializeAttachment() as Attachment;
      a.focus = typeof msg.focus === "string" ? msg.focus.slice(0, 80) : null;
      ws.serializeAttachment(a);
      this.broadcastPresence();
    } else if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
  }

  async webSocketClose(ws: WebSocket) {
    try { ws.close(1000); } catch { /* already closed */ }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcastPresence(ws);
  }

  private presence(exclude?: WebSocket) {
    const byUser = new Map<string, Attachment>();
    for (const s of this.ctx.getWebSockets()) {
      if (s === exclude || s.readyState !== WebSocket.OPEN) continue;
      const a = s.deserializeAttachment() as Attachment;
      const prev = byUser.get(a.uid);
      // A person with several tabs appears once; show their most recent focus.
      if (!prev || (a.focus && a.since >= prev.since)) byUser.set(a.uid, a);
    }
    return [...byUser.values()].map(({ uid, name, avatar, focus }) => ({ uid, name, avatar, focus }));
  }

  private broadcastPresence(exclude?: WebSocket) {
    this.send({ type: "presence", users: this.presence(exclude) }, exclude);
  }

  private send(msg: unknown, exclude?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const s of this.ctx.getWebSockets()) {
      if (s === exclude) continue;
      try { s.send(data); } catch { /* socket closing */ }
    }
  }
}
