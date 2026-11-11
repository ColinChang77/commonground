import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getDb } from "@/db";
import { authenticateMcp } from "@/lib/mcp/auth";
import { buildMcpServer, touchToken } from "@/lib/mcp/server";
import { rateLimit } from "@/lib/rate-limit";
import { appUrl } from "@/lib/env";

function unauthorized() {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: send Authorization: Bearer <CommonGround MCP token>" }, id: null }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="commonground-mcp"' },
  });
}

async function handle(req: Request) {
  const db = getDb();
  const who = await authenticateMcp(db, req.headers.get("authorization"));
  if (!who) return unauthorized();
  if (!(await rateLimit(`mcp:${who.tokenId}`, 120, 60))) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32029, message: "Rate limit exceeded (120 requests/minute)." }, id: null }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } });
  }
  const client = req.headers.get("user-agent");
  await touchToken(db, who.tokenId, client);
  const server = buildMcpServer(db, who, client?.slice(0, 80) ?? null, appUrl());
  // Stateless: a fresh transport per request, JSON responses (no long-lived SSE on Workers).
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = () => new Response(JSON.stringify({ error: "Use POST (Streamable HTTP, stateless JSON mode)." }), { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } });
export const DELETE = GET;
