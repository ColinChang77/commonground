# Launch readiness — 2026-11-11

**Verdict: NOT launch-ready.** Deployed as a private beta at https://commonground.commonground-app.workers.dev (Cloudflare account "Commonground", D1 `commonground` in APAC). Sign-up is open via **Google sign-in** (since 2026-11-11, Google Cloud project `commonground-514413`, OAuth app published to production). Email + password sign-up stays locked until an email provider is configured; R2 (image uploads) not enabled.

Live checks 2026-11-11: 16 public/auth routes return the expected 200/307/404, MCP without token 401, webhook 503 (GitHub not configured), sign-up API refused (400) with private-beta page, security headers present, remote DB reachable.

## Test results (executed 2026-11-11)
| Suite | Result |
|---|---|
| Unit + integration (Vitest, integration on real local D1) | **44 / 44 passed** — 6 files |
| E2E (Playwright) against `next dev` | **3 / 3 passed** |
| E2E (Playwright) against the built Worker in workerd (`wrangler dev`) | **3 / 3 passed** |
| `tsc --noEmit` | 0 errors |
| ESLint | 0 problems |
| `next build` | success (34 routes) |
| `opennextjs-cloudflare build` | success; upload 13.6 MB / **2.85 MB gzip** |

E2E journey covered (real UI, two browser users): sign-up with email verification → onboarding → post idea → second user comments → **Turn into Project** (prefilled, explicit confirmation, discussion preserved + linked, participant notified) → apply → accept → assign task → submit work → **approve & verify** → verified contribution on profile + notification → create MCP token in UI → **real MCP client over HTTP** lists projects and reads context → token shows "Connected" → bad token 401 → agent activity visible in Build tab. Plus: logged-out read access / auth redirects / open-redirect guard, and 390 px mobile layouts without horizontal overflow on 6 routes.

## Spec scenario coverage (§22)
| # | Scenario | Status |
|---|---|---|
| 1–8 | sign up … contribution verified | ✅ e2e |
| 9–10 | connect GitHub, link repository | ⛔ blocked — needs GitHub App credentials (code + docs done) |
| 11 | create coding task | ✅ (UI + MCP `create_task` tested) |
| 12 | agent receives project context | ✅ e2e over HTTP + integration |
| 13 | agent executes in isolated environment | ⛔ blocked by design — no sandbox backend (see AGENTS.md) |
| 14 | code changes reviewed | 🟡 approval queue with branch + GitHub compare link; diff fetched from GitHub, not rendered in-app |
| 15 | PR created | 🟡 implemented on approval; not live-tested (needs App) |
| 16 | webhook syncs status | ✅ integration (signed-payload logic, dedupe, merge) |
| 17 | contribution record updated | ✅ integration (merge → pending code contribution) |

## Feature checklist
✅ done · 🟡 partial · ⛔ blocked
- ✅ Auth: email+password, verification, reset, sessions, logout, account deletion (blocked if you own shared projects); 🟡 Google/GitHub OAuth wired but untested (no client credentials)
- ✅ Onboarding (username, name, photo, bio, interests, skills, collaboration prefs; optional steps skippable)
- ✅ Feed: For You / Following / Latest / Trending / Projects / Discussions, 10 categories, pagination, real counts
- ✅ Posts (Markdown editor w/ toolbar + preview), image upload (R2), comments + replies, mentions, reactions, bookmarks, share, report, delete
- ✅ Discussion → Project wizard; project workspace (Overview, Discussion, Opportunities, Tasks, Updates, Contributors, Build, Settings); statuses; roles enforced server-side; invitations; transfer; leave; delete
- ✅ Opportunities, applications (apply / withdraw / re-apply / accept / reject), tasks (claim, assign, status), submissions, verification, logged contributions, authorship labels, verification history
- ✅ Notifications (persistent, read/unread, block-aware)
- ✅ Search (FTS5) with type/category/status filters; Collaborate filters (category, compensation, skill)
- ✅ Moderation dashboard (reports queue, remove, suspend/unsuspend, dismiss), blocking, audit logs, North-Star metric (weekly successful collaborations) with AI metrics separated
- ✅ MCP server (9 tools, project resources), Connected Agents settings, revocation, verified connection status
- 🟡 Agent provider adapters + encrypted key storage (validation real); ⛔ hosted execution
- 🟡 GitHub App integration (install verification, linking, org repo creation, issue sync, PR on approval, webhooks) — webhook logic tested, live GitHub untested
- 🟡 Previews/deployments via GitHub deployment_status (no provider credentials needed); no direct Vercel API integration
- ✅ Light/dark/system themes, responsive desktop (left nav + right rail) and mobile (bottom nav), skip link, keyboard-focus styles, reduced motion
- 🟡 Legal docs drafted — **require legal review**

## Remaining launch blockers (exact requirements)
1. **R2**: enable in the Cloudflare dashboard, `npx wrangler r2 bucket create commonground-media`, uncomment `r2_buckets` in wrangler.jsonc, redeploy. Workers Paid recommended (bundle is at 2.85/3 MB free limit).
2. **Email provider**: `RESEND_API_KEY` + verified sender domain (`EMAIL_FROM`). Production sign-up fails without it (by design).
3. **GitHub App**: create per docs/GITHUB_APP.md and set the 6 `GITHUB_*` secrets; then live-test install → link → issue → approved PR → webhook.
4. **OAuth**: ✅ Google configured (redirect `…/api/auth/callback/google`). GitHub sign-in optional.
5. **Hosted agents (optional for launch)**: an isolated execution backend; until then the UI states hosted runs are unavailable.
6. **Legal review** of Terms / Privacy / Community Guidelines; real contact details.
7. **Hardening**: CSP, WAF rate limits, Turnstile on sign-up, error tracking (Sentry), off-platform D1 export schedule.
8. **Deployment verification**: rerun the Playwright suite against the deployed URL.

## Known limitations
- No real-time updates (pages refresh after actions; no websockets).
- Comment threads are one level deep (replies to replies attach to the thread).
- Feed pagination is offset-based.
- Code diffs are reviewed on GitHub, not rendered in CommonGround.
- No semantic search (FTS only, per spec "add when justified").

## Demo data (2026-11-11)
Production currently contains demo content: 10 demo people (`@demo.commonground.app`, cannot sign in), 15 posts, 5 projects. Created by `scripts/seed-demo.mjs` + `scripts/demo-votes.sql`. **Remove before a real launch:** `npx wrangler d1 execute commonground --remote --file scripts/remove-demo.sql`.
Admin account for the owner was created with `scripts/create-user.mjs`.

## Social-first multiplayer redesign (2026-11-11)
**Shipped:** project pages as live social spaces (header with team, progress, presence and one primary next step; Home = What's happening · Ways to help · Conversation · Results; "Here now" panel), one-click join / "I'll do this" for open public projects (owners can switch to applications), contextual feed CTAs ("Join the conversation", "See how to help", "See what's happening", "Explore the outcome") with "who's talking", live comments on posts, human-readable activity timeline (`project_activity`) written by every action and pushed live, "Build with AI" with human-readable agent cards + PR review/merge, `/demo` walkthrough (Alex → Maya → Ryan story, labeled Sample).

**Realtime:** separate Worker `realtime/` (Durable Objects, WebSocket Hibernation, SQLite class → Free plan) at https://commonground-realtime.commonground-app.workers.dev. Tickets are HMAC-signed by the app after an access check (2-minute expiry); the app publishes via service binding. Presence comes only from open sockets.

**Acceptance tests**
| P0 | Test | Result |
|---|---|---|
| P0.1 presence | `tests/e2e/multiplayer.spec.ts` — 3 authenticated sessions see each other, focus ("looking at the shared work"), a to-do taken in one appears live in the others, leaving updates presence | ✅ passed locally; ✅ presence/focus/leave verified on production with 2 accounts |
| P0.2 shared agent | Same spec (scripted MCP client) + `tests/e2e/real-agent.spec.ts` — a **real Claude Code CLI session** (Ryan's account) claimed a to-do, wrote code, ran `node --test` (3 passed), reported progress and submitted; Alex's browser showed each step and the real test count live | ✅ passed locally (real agent run, 54 s) |
| P0.3 shared GitHub | Code complete: branch auto-created on `start_work`, PR opened when the agent owner approves, admins notified, review + merge with the admin's **own GitHub account** (`POST …/reviews`, `PUT …/merge`, branch protection enforced by GitHub), merge webhook by an admin ≠ author → contribution verified + to-do done (integration-tested) | ⛔ **blocked**: needs a GitHub App, a test repository and two GitHub accounts (see GITHUB_APP.md). Not live-tested. |

Hosted (server-side) agent execution remains blocked — no isolated sandbox; agents run on the contributor's machine (Claude Code / Codex via MCP).
