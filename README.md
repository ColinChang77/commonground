# CommonGround

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
