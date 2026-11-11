# Deployment & operations (Cloudflare)

## First deploy
Log in with the Cloudflare account that should own and pay for CommonGround (`npx wrangler login`), then:
```bash
npx wrangler d1 create commonground            # paste database_id into wrangler.jsonc
npx wrangler r2 bucket create commonground-media
# set APP_URL in wrangler.jsonc "vars" to your final URL
for s in BETTER_AUTH_SECRET CREDENTIAL_ENCRYPTION_KEY RESEND_API_KEY EMAIL_FROM; do npx wrangler secret put $s; done
# optional: GOOGLE_CLIENT_ID/SECRET, GITHUB_* (docs/GITHUB_APP.md), POSTHOG_KEY/HOST
npm run db:migrate:remote
npm run deploy
```
Make the first admin: `npx wrangler d1 execute commonground --remote --command "UPDATE profiles SET platform_role='admin' WHERE username='…'"`.

## Environment variables
| Name | Required | Purpose |
|---|---|---|
| `APP_URL` | yes | public origin (auth callbacks, links) |
| `ENVIRONMENT` | yes | `production` disables the dev email sink |
| `BETTER_AUTH_SECRET` | yes | session/token signing (32+ random bytes) |
| `CREDENTIAL_ENCRYPTION_KEY` | yes | 32 bytes base64, encrypts stored agent API keys |
| `RESEND_API_KEY`, `EMAIL_FROM` | yes (prod) | verification + password reset email; sign-up fails loudly without it |
| `GOOGLE_CLIENT_ID/SECRET` | optional | Google sign-in (button hidden if unset) |
| `GITHUB_CLIENT_ID/SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | optional | GitHub sign-in + App |
| `POSTHOG_KEY`, `POSTHOG_HOST` | optional | analytics forwarding (events are always stored in D1) |
Bindings: `DB` (D1), `MEDIA` (R2), `ASSETS`, `WORKER_SELF_REFERENCE`.

## Limits & costs
- Worker bundle: **2.91 MB gzip** (measured 2026-11-11, after redesign) — under the 3 MB Free-plan limit with little headroom; Workers Paid ($5/mo) raises it to 10 MB and is recommended for launch.
- D1 / R2 free tiers cover early usage; R2 requires a payment method on the account.
- Rate limits: auth endpoints (Better Auth, DB-backed: sign-in 8/min, sign-up 10/h, reset 5/h), posts 6/10 min, comments 20/5 min, applications 10/h, uploads 10/5 min, MCP 120/min/token. Add Cloudflare WAF rate-limiting rules for IP-level protection.
- Agent spend: hosted runs are disabled; when enabled, per-project `agent_budget_cents` and per-run budgets must gate execution.

## Monitoring, errors, backups
- `observability.enabled` is on in `wrangler.jsonc` → Workers Logs/metrics in the dashboard; `npx wrangler tail` for live logs. Unexpected server-action errors are logged with `[action]` / `[mcp]` prefixes. Add an error tracker (e.g. Sentry's Cloudflare SDK) before launch — not yet wired.
- **Backups**: D1 Time Travel gives point-in-time restore for the last 30 days (`npx wrangler d1 time-travel restore commonground --timestamp …`). For off-platform copies schedule `npx wrangler d1 export commonground --remote --output backup.sql` (note: FTS virtual tables aren't exported; rebuild by re-running `0001_search_fts.sql` triggers + a reindex insert). R2: enable object versioning/lifecycle or replicate.
- Webhook failures: `github_webhook_events.status`; failed deliveries release their claim so GitHub redelivery retries.
