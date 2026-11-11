# Architecture

```
Browser ──► Cloudflare Worker (Next.js 16 via OpenNext)
              ├─ Server Components (reads)         ─┐
              ├─ Server Actions (all mutations)     ├─► D1 (SQLite, Drizzle)   ← FTS5 search, triggers
              ├─ /api/auth/*   Better Auth          ┘   R2 (images)
              ├─ /api/mcp      MCP server (Streamable HTTP, stateless)  ◄── Claude Code / Codex / any MCP client
              ├─ /api/github/webhook  (HMAC verified, idempotent)       ◄── GitHub App
              ├─ /api/github/setup    (install callback, ownership verified)
              └─ /media/*      R2 image proxy (type-checked, sandboxed)
External: GitHub REST (App JWT → per-repo installation tokens), Anthropic/OpenAI APIs (key validation only),
          Resend (email), PostHog (optional analytics).
```

## Key decisions
- **All on Cloudflare** (user decision). D1 replaces Postgres: no RLS, so authorization lives in one place — `src/lib/permissions.ts` (pure role matrix, unit-tested) used by `src/lib/authz.ts` and the MCP server. No table is ever queried from the browser.
- **Every mutation is a server action** wrapped by `activeViewer()` (`src/lib/action.ts`): signed in → email verified → onboarded → not suspended → per-user rate limit. Inputs are Zod-validated. Next.js server actions enforce same-origin (CSRF).
- **Feed** is plain SQL with real counts (denormalized counters are recomputed from rows in the same batch). Trending = engagement over 14 days with age decay; For You = interests + follows + recency boost.
- **Search** = SQLite FTS5 (`search_fts`), maintained by triggers so web, MCP and webhook writes are all indexed. Visibility rules are applied in the search SQL.
- **Discussion → Project** keeps the discussion (it can't be deleted afterward), links both ways, turns requested roles into opportunities, and notifies participants — only after an explicit confirmation checkbox.
- **Contributions**: approving a task submission = verification; it records authorship (human / AI-assisted / agent-generated), verifier and history. Merged PRs only create *pending* records — merges never grant credit on their own.
- **AI agents**: two modes.
  - *Bring your own agent* (working): scoped, hashed, expiring MCP tokens; every tool re-checks membership/role; work submissions and public updates become **approval requests** a human admin approves; approval opens the GitHub PR with the approver's authority.
  - *Hosted execution* (blocked by design until a sandbox exists): provider adapters (`src/lib/agents`) validate keys with official APIs and store them AES-256-GCM encrypted, but `executeTask` refuses to run without an isolated `ExecutionBackend`. We never run repo code inside the web Worker.
- **GitHub App** only: installation tokens are minted per call, restricted to one repository and the minimum permissions (e.g. `issues: write` for issue sync, `pull_requests: write` for PRs).
- **Deployments/previews** come from GitHub `deployment_status` webhooks, so any provider with a GitHub integration (Vercel, Cloudflare Pages, Netlify) shows up without extra credentials. CommonGround never deploys to production.

## Code map
| Path | What |
|---|---|
| `src/db/schema.ts` | all tables (49) |
| `drizzle/` | migrations (`0001_search_fts.sql` = FTS + triggers + seed) |
| `src/lib/` | auth, authz/permissions, crypto, rate limit, notify, audit, analytics, markdown (safe), email |
| `src/lib/github/` | App JWT + REST client, webhook verification/processing |
| `src/lib/mcp/` | MCP auth + server (tools/resources) |
| `src/lib/agents/` | provider adapter contract + Anthropic/OpenAI adapters |
| `src/server/*.ts` | server actions; `src/server/queries/` read models |
| `src/app/(app)` | app shell pages; `(auth)` sign-in/up/onboarding; `api/` route handlers |
