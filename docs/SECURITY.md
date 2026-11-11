# Security review (2026-11-11)

Scope: authentication, authorization, data isolation, agent/MCP surface, GitHub integration, uploads, content safety. Method: design review of every mutation path + automated tests for the critical boundaries (see LAUNCH_READINESS.md for numbers).

## Controls in place
| Threat | Control | Evidence |
|---|---|---|
| Unauthorized access / privilege escalation | Single role matrix (`permissions.ts`) used by web actions and MCP; role assignment can't grant owner or let admins promote admins; owners can't be removed; self-review/self-verify blocked | `tests/unit/permissions.test.ts` (6) |
| Cross-project leakage | Private projects, their discussions, tasks, contributions and search hits only resolve for members; outsiders get 404 / "not found" | MCP leakage tests; search SQL filters; e2e |
| Agent overreach / prompt injection | Scoped, hashed, expiring, revocable MCP tokens; membership required even on public projects; untrusted content labeled and tag-escaped; sensitive mutations become human approvals executed with the approver's re-checked permissions; agents can't mark work done | `tests/integration/mcp.test.ts` (13) |
| Secret exfiltration | Agent API keys AES-256-GCM (owner id as AAD, tamper/wrong-key/row-swap rejected), never sent to browser; MCP tokens hash-only; OAuth tokens encrypted; GitHub installation tokens minted per call, single-repo, least-privilege, never stored | `tests/unit/crypto.test.ts` (8) |
| Forged webhooks / replays | HMAC-SHA256 with constant-time compare; delivery-id primary key; unlinked repos ignored | `tests/integration/webhooks.test.ts` (7) |
| Install hijack (forged `installation_id`) | Setup callback verifies the installation via the user's own GitHub token before storing | code review (`api/github/setup`) — not live-tested |
| Malicious code execution | No repository code runs in the web Worker; hosted execution refuses without an isolated backend | code review |
| Unauthorized production deploy | CommonGround has no production-deploy capability; PRs are never auto-merged | code review |
| XSS | All user Markdown escaped, allow-listed tags, `http(s)/mailto` links only, `rel=nofollow ugc noopener`; search snippets escaped | `tests/unit/markdown.test.ts` (8) |
| Malicious uploads | Magic-byte sniffing (PNG/JPEG/GIF/WebP only, no SVG), 5 MB cap, per-user rate limit, served with `nosniff` + sandbox CSP from a fixed key pattern | code review |
| CSRF | Server actions (Next.js same-origin check); Better Auth trusted origins | framework |
| Brute force / spam | DB-backed rate limits (atomic UPSERT — concurrency-tested), spam heuristic on posts/comments, blocking, reporting, moderation queue, suspension (kills sessions) | `tests/integration/rate-limit.test.ts` (2) |
| Open redirects | `safeNext()` on every `?next=`/`state` | e2e (`//evil.example`) |
| Account takeover | Email verification required to act, 10+ char passwords, reset revokes sessions, password change revokes other sessions, secure cookies in production | Better Auth |
| Auditability | `audit_logs` for role changes, removals, transfers, repo link/unlink, token/key create/revoke, approvals, moderation | code review |

## Known gaps (fix before/soon after launch)
1. **No Content-Security-Policy** on app pages (security headers set: HSTS, nosniff, frame DENY, referrer, permissions). Add a nonce-based CSP.
2. **Images in private projects are public-by-URL** (unguessable UUID keys, but not access-checked). Route private-project media through an authz check if that matters.
3. **No IP-level rate limiting** beyond Better Auth's auth endpoints — add Cloudflare WAF rules.
4. **No error tracker** wired (logs only).
5. Spam heuristics are basic; no CAPTCHA/Turnstile on sign-up yet.
6. GitHub install/link/PR flows are untested against real GitHub (no App credentials here).
7. Legal documents are drafts requiring counsel review.
8. Invitations don't check blocks; follow notifications reuse the `mention` type (cosmetic).
