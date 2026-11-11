# AI agents & MCP

CommonGround supports two modes. Both only use officially supported, documented interfaces. Consumer subscriptions (ChatGPT Plus, Claude Pro/Max) are **not** used and their session cookies/tokens are never collected.

## Mode B — Bring your own agent (working)

The MCP server lives at **`POST /api/mcp`** (Streamable HTTP, stateless, JSON responses), built on `@modelcontextprotocol/sdk`.

### Connect (for users)
1. Settings → **Connected agents** → *Create token*. Choose: all projects or one project, read-only or "allow changes", expiry (7–365 days). The token (`cg_mcp_…`) is shown **once**; only its SHA-256 hash is stored.
2. Add it to your agent:
   - **Claude Code**
     ```bash
     claude mcp add --transport http commonground https://YOUR_HOST/api/mcp \
       --header "Authorization: Bearer cg_mcp_…"
     ```
   - **Codex CLI** — `~/.codex/config.toml`, then `export COMMONGROUND_TOKEN=cg_mcp_…`
     ```toml
     [mcp_servers.commonground]
     url = "https://YOUR_HOST/api/mcp"
     bearer_token_env_var = "COMMONGROUND_TOKEN"
     ```
     (Check the current Codex CLI docs for the exact remote-MCP keys of your version.)
   - **Any MCP client**: `{"type":"http","url":"https://YOUR_HOST/api/mcp","headers":{"Authorization":"Bearer cg_mcp_…"}}`
3. The token row switches to **"Connected — last used …"** only after a real authenticated request arrives. Revoke anytime; access stops immediately.

### Tools
| Tool | Scope | Notes |
|---|---|---|
| `list_projects` | read | only projects you're a member of (∩ token scope) |
| `get_project`, `get_project_context` | read | context = overview, requirements, open tasks, updates, discussion summaries, repo metadata |
| `list_tasks`, `get_task` | read | `get_task` returns a suggested branch name `cg/<task-id-8>-<slug>` |
| `create_task` | write | contributor+ |
| `update_task` | write | claim / move own task between todo ↔ in_progress; cannot mark done |
| `start_work` | write | claims the task, starts a shared session the whole team sees live; creates the task branch if a repo is linked |
| `report_progress` | write | plain-language progress, stage (working/testing/changes_ready/failed), real test counts, files changed — pushed live |
| `submit_contribution` | write | **creates an approval request** (accepts `run_id`); the agent owner or an admin approves; with a branch, approval opens the PR |
| `add_project_update` | write | **approval request**; published only after a human approves |

Resources: `commonground://projects/{projectId}/{overview|requirements|tasks|updates|discussions|repository|context}`.

### Security model
- Per-call checks: token valid/unexpired/unrevoked, user not suspended, project in token scope, **user is a member** (even public projects), role allows the action (same matrix as the web app). Outsiders get "not found".
- Prompt-injection resistance: community text is wrapped in `<untrusted_user_content>` (nested tags stripped); server instructions tell agents to treat it as data. Agents can't escalate: sensitive actions become approval requests, executed later with the **approving human's** permissions re-checked.
- Every tool call is logged as an `agent_run_events` row (shown live in the project's Build tab) and rate limited (120 req/min/token).

## Mode A — Hosted agent execution (blocked by design)

Implemented: provider adapter contract (`src/lib/agents/types.ts`) with `validateCredentials / createSession / executeTask / streamEvents / requestApproval / cancelExecution / getExecutionStatus`, and adapters:
- **Anthropic** — key validated with the official SDK (`client.models.list()`); default model `claude-opus-5-5`.
- **OpenAI** — key validated with the documented `GET /v1/models`.

Keys are stored AES-256-GCM encrypted (`CREDENTIAL_ENCRYPTION_KEY`, owner id as AAD), never returned to the browser, revocable.

**Blocker:** running an agent on a repository requires an isolated, ephemeral sandbox (CPU/memory/time/network limits, no platform secrets, cleanup). None is configured, and we do not substitute unsafe execution inside the web Worker. `executeTask` therefore returns `execution_backend_unavailable` and the UI says so — no simulated progress.

To enable later, implement `ExecutionBackend` (`provision → stream → cancel → cleanup`) on isolated infrastructure — e.g. Cloudflare Sandbox SDK / Containers (Workers Paid), or a separate worker fleet — then: create task branch via installation token → run agent with task context and a per-run budget/timeout → run tests → collect diff → `agent_approvals` → push + PR (code for the PR step already exists in `decideApproval`). Track usage in `agent_usage_records` / `agent_runs`.
