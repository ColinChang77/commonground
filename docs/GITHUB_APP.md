# GitHub App setup

One GitHub App handles both "Sign in with GitHub" and repository access.

1. GitHub → Settings → Developer settings → **GitHub Apps → New**.
2. **Callback URL**: `https://YOUR_HOST/api/auth/callback/github` · tick *Request user authorization (OAuth) during installation*: **off** (users sign in separately) · *Expire user tokens*: on.
3. **Setup URL**: `https://YOUR_HOST/api/github/setup` · tick *Redirect on update*.
4. **Webhook URL**: `https://YOUR_HOST/api/github/webhook`, **secret**: `openssl rand -hex 32`.
5. **Repository permissions** (minimum): Metadata *read* · Contents *read* · Issues *read & write* · Pull requests *read & write* · Deployments *read*. Optional: Administration *write* (only if you want CommonGround to create org repositories).
6. **Subscribe to events**: Installation target, Issues, Pull request, Push, Repository, Deployment status.
7. Generate a **private key**, convert to PKCS#8 (WebCrypto requirement):
   `openssl pkcs8 -topk8 -nocrypt -in downloaded.pem -out app-pkcs8.pem`
8. Set secrets (`wrangler secret put …` in production, `.dev.vars` locally):
   `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` (PEM, `\n` escaped is fine), `GITHUB_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

## How it's used
- **Install**: Build tab → *Install GitHub App* → GitHub → back to `/api/github/setup`. The `installation_id` in that URL is untrusted, so we confirm with the user's own GitHub token (`GET /user/installations`) before storing it. Users must have connected GitHub (Settings → Account).
- **Link repo**: list via installation token (`GET /installation/repositories`), re-verified server-side on link.
- **Tokens**: minted per operation, restricted to the one repository and the needed permissions; never stored.
- **Issues**: task → issue (body carries `CommonGround-Task: <id>`).
- **PRs**: opened only after a human approves an agent submission; never merged by CommonGround; branch protection stays on GitHub.
- **Webhooks**: HMAC-SHA256 verified (constant-time), delivery id deduplicated, unlinked repos ignored. Merged PRs from members create *pending* code contributions for admins to verify.
- **Deployments**: `deployment_status` events populate Preview & deployments (works with Vercel/Cloudflare Pages/Netlify GitHub integrations).

Not verified live yet (no App credentials in this environment): install flow, repo listing, issue/PR creation against real GitHub. Webhook processing is covered by integration tests with GitHub-shaped payloads.
