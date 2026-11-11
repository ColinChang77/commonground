# Database schema

Cloudflare D1 (SQLite). Source of truth: `src/db/schema.ts`; migrations in `drizzle/`. Timestamps are integer milliseconds; ids are UUIDs unless an external id is the key.

49 tables + the `search_fts` FTS5 virtual table.

## Auth (Better Auth)
- **user** — id, name, email, email_verified, image, created_at, updated_at
- **session** — id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id
- **account** — id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at
- **verification** — id, identifier, value, expires_at, created_at, updated_at
- **rate_limit** — id, key, count, last_request

## Profiles & social
- **profiles** — user_id, username, display_name, bio, avatar_key, collab_prefs, platform_role, onboarded_at, suspended_at, suspended_reason, created_at, updated_at
- **user_interests** — user_id, category
- **skills** — id, slug, name
- **user_skills** — user_id, skill_id
- **follows** — follower_id, followee_id, created_at
- **blocks** — blocker_id, blocked_id, created_at
- **media** — id, owner_id, key, content_type, size, created_at

## Projects & feed
- **projects** — id, slug, owner_id, title, summary, description, goals, outcomes, category, status, visibility, is_software, links, tags, agent_budget_cents, source_discussion_id, created_at, updated_at
- **project_members** — project_id, user_id, role, created_at
- **project_invitations** — id, project_id, invitee_id, invited_by, role, status, created_at
- **discussions** — id, author_id, kind, title, body, category, image_key, project_id, converted_project_id, status, comment_count, reaction_count, last_activity_at, created_at, updated_at
- **comments** — id, discussion_id, author_id, parent_id, body, status, created_at, updated_at
- **reactions** — user_id, target_type, target_id, kind, created_at
- **bookmarks** — user_id, discussion_id, created_at
- **project_updates** — id, project_id, author_id, title, body, is_milestone, source, status, created_at

## Collaboration
- **opportunities** — id, project_id, created_by, title, description, deliverable, commitment, compensation, deadline, status, created_at, updated_at
- **opportunity_skills** — opportunity_id, skill_id
- **applications** — id, opportunity_id, project_id, applicant_id, message, status, reviewed_by, reviewed_at, created_at, updated_at
- **tasks** — id, project_id, title, description, deliverable, status, contribution_type, is_coding, assignee_id, created_by, created_via, due_at, created_at, updated_at
- **task_submissions** — id, task_id, submitter_id, summary, link, authorship, agent_label, status, reviewed_by, review_note, reviewed_at, created_at
- **contributions** — id, project_id, user_id, task_id, submission_id, type, title, description, authorship, agent_label, pull_request_id, commit_shas, status, verified_by, verified_at, created_at
- **contribution_verifications** — id, contribution_id, actor_id, action, note, created_at

## Notifications, moderation, ops
- **notifications** — id, user_id, actor_id, type, project_id, title, body, url, read_at, created_at
- **reports** — id, reporter_id, target_type, target_id, reason, details, status, resolved_by, resolved_at, created_at
- **moderation_actions** — id, moderator_id, target_type, target_id, action, reason, report_id, created_at
- **audit_logs** — id, actor_id, via, action, entity_type, entity_id, project_id, metadata, ip, created_at
- **app_rate_limits** — key, window_start, count
- **analytics_events** — id, user_id, name, properties, created_at
- **dev_outbox** — id, to, subject, body, url, created_at

## AI agents
- **agent_providers** — id, name, kind, docs_url, enabled
- **user_agent_connections** — id, user_id, provider_id, label, encrypted_secret, secret_hint, status, last_validated_at, last_error, revoked_at, created_at
- **mcp_tokens** — id, user_id, name, token_hash, token_prefix, scopes, project_ids, last_used_at, last_client, expires_at, revoked_at, created_at
- **agent_sessions** — id, project_id, user_id, provider_id, mode, connection_id, mcp_token_id, client_name, status, created_at, last_event_at
- **agent_runs** — id, session_id, project_id, task_id, user_id, provider_id, model, status, branch, prompt, summary, budget_cents, est_cost_cents, input_tokens, output_tokens, duration_ms, error, started_at, finished_at, created_at
- **agent_run_events** — id, run_id, session_id, type, message, data, created_at
- **agent_approvals** — id, project_id, run_id, session_id, requested_by, requested_via, action, summary, payload, status, decided_by, decided_at, result_ref, created_at
- **agent_usage_records** — id, run_id, project_id, user_id, provider_id, model, input_tokens, output_tokens, cost_cents, created_at

## GitHub
- **github_installations** — id, account_login, account_type, installed_by_user_id, repository_selection, suspended_at, deleted_at, created_at, updated_at
- **project_repositories** — id, project_id, installation_id, repo_id, full_name, default_branch, is_private, linked_by, last_push_at, created_at
- **github_issues** — id, project_repository_id, task_id, number, title, state, html_url, updated_at
- **github_pull_requests** — id, project_repository_id, task_id, run_id, number, title, state, head_ref, base_ref, head_sha, html_url, author_login, merged_at, created_at, updated_at
- **github_webhook_events** — delivery_id, event, action, installation_id, status, error, created_at

## Deployments
- **project_deployments** — id, project_id, provider, external_id, environment, state, url, log_url, sha, ref, creator, created_at, updated_at
- **deployment_events** — id, deployment_id, state, description, created_at

## Integrity & security notes
- CHECK constraints on every enum-like column (status, role, kind, compensation, authorship…).
- Unique: one application per (opportunity, applicant); one report per (reporter, target); one repo per project; `(repo, number)` for issues/PRs; webhook `delivery_id` primary key = idempotency.
- Indexes on every feed/list access path (status+created_at, project+status, user lookups).
- Secrets: `user_agent_connections.encrypted_secret` is AES-256-GCM with the owner id as AAD; `mcp_tokens` stores only SHA-256 hashes; OAuth tokens in `account` are encrypted by Better Auth (`encryptOAuthTokens`). None of these columns are selected by any page query.
- No RLS in D1: all reads/writes go through server code that applies `src/lib/permissions.ts`.
