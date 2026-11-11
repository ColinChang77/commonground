/**
 * GitHub webhook processing. Pure w.r.t. HTTP: `verifySignature` checks X-Hub-Signature-256,
 * `processWebhook` applies an already-verified event to the database idempotently
 * (X-GitHub-Delivery is the primary key of github_webhook_events).
 */
import { and, eq, like, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  account, contributionVerifications, contributions, taskSubmissions, deploymentEvents, githubInstallations, githubIssues, githubPullRequests,
  githubWebhookEvents, projectDeployments, projectMembers, projectRepositories, projects, tasks,
} from "@/db/schema";
import { hmacSha256Hex, timingSafeEqual } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { taskIdPrefixFromBranch } from "@/lib/github/app";

export async function verifySignature(secretValue: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const expected = `sha256=${await hmacSha256Hex(secretValue, rawBody)}`;
  return timingSafeEqual(expected, header);
}

type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Hooks = {
  onNotify?: (n: { userId: string; title: string; url: string; projectId: string }) => Promise<void>;
  onActivity?: (a: { projectId: string; message: string; taskId: string | null }) => Promise<void>;
};

export type WebhookOutcome = { status: "processed" | "ignored" | "duplicate"; detail?: string };

export async function processWebhook(db: DB, deliveryId: string, event: string, payload: Payload, hooks: Hooks = {}): Promise<WebhookOutcome> {
  const installationId = payload.installation?.id != null ? String(payload.installation.id) : null;
  const claimed = await db
    .insert(githubWebhookEvents)
    .values({ deliveryId, event, action: payload.action ?? null, installationId, status: "processing" })
    .onConflictDoNothing()
    .returning({ id: githubWebhookEvents.deliveryId });
  if (!claimed.length) return { status: "duplicate" };

  try {
    const outcome = await handle(db, event, payload, hooks);
    await db.update(githubWebhookEvents).set({ status: outcome.status, error: outcome.detail ?? null }).where(eq(githubWebhookEvents.deliveryId, deliveryId));
    return outcome;
  } catch (e) {
    // Release the claim so GitHub's redelivery can retry.
    await db.delete(githubWebhookEvents).where(eq(githubWebhookEvents.deliveryId, deliveryId));
    throw e;
  }
}

async function repoLink(db: DB, repoId: unknown) {
  if (repoId == null) return null;
  const [link] = await db.select().from(projectRepositories).where(eq(projectRepositories.repoId, String(repoId))).limit(1);
  return link ?? null;
}

async function taskFromBranch(db: DB, projectId: string, ref: string, body: string | null) {
  const marker = body ? /CommonGround-Task:\s*([0-9a-f-]{36})/i.exec(body)?.[1] : null;
  if (marker) {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, marker), eq(tasks.projectId, projectId))).limit(1);
    if (t) return t.id;
  }
  const prefix = taskIdPrefixFromBranch(ref);
  if (!prefix) return null;
  const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.projectId, projectId), like(tasks.id, `${prefix}%`))).limit(1);
  return t?.id ?? null;
}

async function userForGithubId(db: DB, githubUserId: unknown) {
  if (githubUserId == null) return null;
  const [a] = await db.select({ userId: account.userId }).from(account).where(and(eq(account.providerId, "github"), eq(account.accountId, String(githubUserId)))).limit(1);
  return a?.userId ?? null;
}

async function handle(db: DB, event: string, p: Payload, hooks: Hooks): Promise<WebhookOutcome> {
  const now = new Date();
  switch (event) {
    case "ping":
      return { status: "processed", detail: "ping" };

    case "installation": {
      const id = String(p.installation.id);
      if (p.action === "deleted") {
        await db.update(githubInstallations).set({ deletedAt: now, updatedAt: now }).where(eq(githubInstallations.id, id));
        await db.delete(projectRepositories).where(eq(projectRepositories.installationId, id));
      } else if (p.action === "suspend" || p.action === "unsuspend") {
        await db.update(githubInstallations).set({ suspendedAt: p.action === "suspend" ? now : null, updatedAt: now }).where(eq(githubInstallations.id, id));
      } else if (p.action === "created" || p.action === "new_permissions_accepted") {
        await db
          .insert(githubInstallations)
          .values({ id, accountLogin: p.installation.account?.login ?? "unknown", accountType: p.installation.account?.type ?? "User", repositorySelection: p.installation.repository_selection ?? null })
          .onConflictDoUpdate({ target: githubInstallations.id, set: { accountLogin: p.installation.account?.login ?? "unknown", deletedAt: null, updatedAt: now } });
      }
      return { status: "processed" };
    }

    case "installation_repositories": {
      const removed: { id: number }[] = p.repositories_removed ?? [];
      for (const r of removed) await db.delete(projectRepositories).where(eq(projectRepositories.repoId, String(r.id)));
      return { status: "processed", detail: `removed ${removed.length}` };
    }

    case "repository": {
      const link = await repoLink(db, p.repository?.id);
      if (!link) return { status: "ignored", detail: "repo not linked" };
      if (p.action === "deleted" || p.action === "transferred") await db.delete(projectRepositories).where(eq(projectRepositories.id, link.id));
      else if (p.action === "renamed" || p.action === "edited" || p.action === "privatized" || p.action === "publicized")
        await db.update(projectRepositories).set({ fullName: p.repository.full_name, defaultBranch: p.repository.default_branch, isPrivate: Boolean(p.repository.private) }).where(eq(projectRepositories.id, link.id));
      return { status: "processed" };
    }

    case "push": {
      const link = await repoLink(db, p.repository?.id);
      if (!link) return { status: "ignored", detail: "repo not linked" };
      await db.update(projectRepositories).set({ lastPushAt: now }).where(eq(projectRepositories.id, link.id));
      return { status: "processed" };
    }

    case "issues": {
      const link = await repoLink(db, p.repository?.id);
      if (!link) return { status: "ignored", detail: "repo not linked" };
      const i = p.issue;
      const res = await db
        .update(githubIssues)
        .set({ title: i.title, state: i.state, htmlUrl: i.html_url, updatedAt: now })
        .where(and(eq(githubIssues.projectRepositoryId, link.id), eq(githubIssues.number, i.number)))
        .returning({ id: githubIssues.id });
      if (!res.length && p.action === "opened")
        await db.insert(githubIssues).values({ id: newId(), projectRepositoryId: link.id, number: i.number, title: i.title, state: i.state, htmlUrl: i.html_url }).onConflictDoNothing();
      return { status: "processed" };
    }

    case "pull_request": {
      const link = await repoLink(db, p.repository?.id);
      if (!link) return { status: "ignored", detail: "repo not linked" };
      const pr = p.pull_request;
      const state = pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open";
      const taskId = await taskFromBranch(db, link.projectId, pr.head?.ref ?? "", pr.body ?? null);
      const [existing] = await db.select().from(githubPullRequests).where(and(eq(githubPullRequests.projectRepositoryId, link.id), eq(githubPullRequests.number, pr.number))).limit(1);
      let prId = existing?.id;
      if (existing) {
        await db
          .update(githubPullRequests)
          .set({ title: pr.title, state, headRef: pr.head.ref, baseRef: pr.base.ref, headSha: pr.head.sha, htmlUrl: pr.html_url, mergedAt: pr.merged_at ? new Date(pr.merged_at) : null, taskId: existing.taskId ?? taskId, updatedAt: now })
          .where(eq(githubPullRequests.id, existing.id));
      } else {
        prId = newId();
        await db.insert(githubPullRequests).values({ id: prId, projectRepositoryId: link.id, taskId, number: pr.number, title: pr.title, state, headRef: pr.head.ref, baseRef: pr.base.ref, headSha: pr.head.sha, htmlUrl: pr.html_url, authorLogin: pr.user?.login ?? null, mergedAt: pr.merged_at ? new Date(pr.merged_at) : null });
      }
      const resolvedTask = existing?.taskId ?? taskId;

      if (state === "merged" && prId) {
        // Merged code becomes a contribution record for the PR's author (if they're a CommonGround member);
        // it stays "pending" until a project admin verifies it — merge alone never grants credit.
        const authorUserId = await userForGithubId(db, pr.user?.id);
        const [already] = await db.select({ id: contributions.id }).from(contributions).where(eq(contributions.pullRequestId, prId)).limit(1);
        if (already) {
          await db.update(contributions).set({ commitShas: JSON.stringify([pr.merge_commit_sha].filter(Boolean)) }).where(eq(contributions.id, already.id));
        } else if (authorUserId) {
          const [member] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, link.projectId), eq(projectMembers.userId, authorUserId))).limit(1);
          if (member) {
            const cid = newId();
            // Merged by a project owner/admin who isn't the author = a human review happened → verified.
            const mergerId = await userForGithubId(db, pr.merged_by?.id);
            const [merger] = mergerId && mergerId !== authorUserId ? await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, link.projectId), eq(projectMembers.userId, mergerId))).limit(1) : [];
            const verifiedBy = merger && (merger.role === "owner" || merger.role === "admin") ? mergerId : null;
            const agentLabel = /Generated with \[?Claude Code|Co-Authored-By: Claude|codex/i.exec(pr.body ?? "")?.[0] ?? null;
            await db.insert(contributions).values({
              id: cid, projectId: link.projectId, userId: authorUserId, taskId: resolvedTask, type: "code", title: pr.title,
              description: `Merged pull request #${pr.number}`, authorship: agentLabel ? "ai_assisted" : "human", agentLabel: agentLabel ? "AI coding agent" : null,
              pullRequestId: prId, commitShas: JSON.stringify([pr.merge_commit_sha].filter(Boolean)), status: verifiedBy ? "verified" : "pending",
              verifiedBy, verifiedAt: verifiedBy ? now : null,
            });
            await db.insert(contributionVerifications).values({ id: newId(), contributionId: cid, actorId: verifiedBy ?? "github", action: verifiedBy ? "verified_by_merge_review" : "recorded_from_merge", note: pr.html_url });
            if (verifiedBy && resolvedTask) {
              await db.update(tasks).set({ status: "done", updatedAt: now }).where(eq(tasks.id, resolvedTask));
              await db.update(taskSubmissions).set({ status: "approved", reviewedBy: verifiedBy, reviewedAt: now }).where(and(eq(taskSubmissions.taskId, resolvedTask), eq(taskSubmissions.status, "submitted")));
            }
          }
        }
        if (resolvedTask) await db.update(tasks).set({ status: sql`CASE WHEN ${tasks.status} = 'done' THEN 'done' ELSE 'in_review' END`, updatedAt: now }).where(eq(tasks.id, resolvedTask));
        if (hooks.onActivity) await hooks.onActivity({ projectId: link.projectId, message: `The changes for “${pr.title}” were merged 🎉`, taskId: resolvedTask });
        const [proj] = await db.select({ ownerId: projects.ownerId, slug: projects.slug }).from(projects).where(eq(projects.id, link.projectId)).limit(1);
        if (proj && hooks.onNotify) await hooks.onNotify({ userId: proj.ownerId, title: `PR #${pr.number} merged: ${pr.title}`, url: `/p/${proj.slug}/build`, projectId: link.projectId });
      }
      if (p.action === "opened" && hooks.onActivity) await hooks.onActivity({ projectId: link.projectId, message: `New changes ready for review: “${pr.title}”`, taskId: resolvedTask });
      return { status: "processed", detail: state };
    }

    case "deployment_status": {
      const link = await repoLink(db, p.repository?.id);
      if (!link) return { status: "ignored", detail: "repo not linked" };
      const d = p.deployment;
      const ds = p.deployment_status;
      const externalId = String(d.id);
      const [existing] = await db.select().from(projectDeployments).where(and(eq(projectDeployments.provider, "github"), eq(projectDeployments.externalId, externalId))).limit(1);
      const values = { state: ds.state, url: ds.environment_url || ds.target_url || null, logUrl: ds.log_url || ds.target_url || null, updatedAt: now };
      let depId = existing?.id;
      if (existing) await db.update(projectDeployments).set(values).where(eq(projectDeployments.id, existing.id));
      else {
        depId = newId();
        await db.insert(projectDeployments).values({ id: depId, projectId: link.projectId, provider: "github", externalId, environment: d.environment ?? "unknown", sha: d.sha ?? null, ref: d.ref ?? null, creator: ds.creator?.login ?? d.creator?.login ?? null, ...values });
      }
      await db.insert(deploymentEvents).values({ id: newId(), deploymentId: depId!, state: ds.state, description: ds.description ?? null });
      return { status: "processed" };
    }

    default:
      return { status: "ignored", detail: `unhandled event ${event}` };
  }
}
