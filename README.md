# CommonGround

### What we built tonight (c0mpiled-18, YC Startup School Hackathon Taipei)
- Showcase posts: a builder shares a project with its GitHub repo in a thread-style feed.
- Comment → change request: a non-technical viewer comments in plain language; an agent restates it and the viewer confirms with one tap.
- One live thread for everyone: viewers, the builder and the agents see each step as it happens.
- Builder approval → pull request, and contribution points for the person whose comment started it.
- Demo mode: GitHub and the cloud sandbox are replaced by labelled test doubles in this build.

Run the demo locally: `npm run db:migrate:local`, start the realtime worker (`cd realtime && npx wrangler dev --port 8790`, with the same `REALTIME_SECRET` in `realtime/.dev.vars` and `.dev.vars`), `npm run dev`, then record with `npx playwright test -c playwright.capture.config.ts demo-90s` (uses the system Chrome). Code: `src/lib/suggestions.ts`, `src/server/suggestions.ts`, `src/components/showcase/`, `drizzle/0005_comment_to_pr.sql`.


**From conversations to collaborations.** A social platform where people share ideas, turn discussions into projects, recruit collaborators, track verified contributions — and, for software projects, work with AI coding agents through GitHub and MCP.

> Status: **not yet launch-ready.** Core product works end-to-end locally and in the Cloudflare Workers runtime; cloud resources, email, GitHub App credentials and legal review are outstanding. See [docs/LAUNCH_READINESS.md](docs/LAUNCH_READINESS.md).

## Stack
Next.js 16 (App Router) on **Cloudflare Workers** via OpenNext · **D1** (SQLite) with Drizzle · **R2** for images · Better Auth (email/password + Google/GitHub OAuth) · Tailwind 4 + shadcn/ui · official MCP TypeScript SDK · official Anthropic SDK · Vitest + Playwright.

## Run locally
```bash
npm install
cp .dev.vars.example .dev.vars        # then fill BETTER_AUTH_SECRET and CREDENTIAL_ENCRYPTION_KEY (openssl rand -base64 32)
npm run db:migrate:local              # creates the local D1 database
npm run dev                           # http://localhost:3100
```
Without an email provider, verification / reset emails are written to the local `dev_outbox` table and printed in the dev-server log (`[dev-mail] … url=…`). Never in production.

Make yourself a moderator locally:
```bash
npx wrangler d1 execute commonground --local --command "UPDATE profiles SET platform_role='admin' WHERE username='YOUR_NAME'"
```

## Commands
| | |
|---|---|
| `npm test` | unit + integration tests (integration tests spin up a real local D1) |
| `npm run test:e2e` | Playwright journey — needs `npm run dev` (or `npm run preview`) on :3100 |
| `npm run typecheck` / `npm run lint` | |
| `npm run preview` | build the Worker and run it locally in workerd |
| `npm run deploy` | build + deploy to Cloudflare (see docs/DEPLOYMENT.md) |

## Docs
- [Architecture](docs/ARCHITECTURE.md) · [Database schema](docs/DATABASE.md)
- [AI agents & MCP setup](docs/AGENTS.md) · [GitHub App setup](docs/GITHUB_APP.md)
- [Deployment & operations](docs/DEPLOYMENT.md) · [Security review](docs/SECURITY.md)
- [Launch readiness, test results, limitations, blockers](docs/LAUNCH_READINESS.md)
