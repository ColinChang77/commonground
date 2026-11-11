"use server";
import { recordActivity } from "@/lib/activity";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { agentApprovals, agentRunEvents, agentRuns, mcpTokens, projectMembers, projectRepositories, projectUpdates, tasks, taskSubmissions, userAgentConnections, githubPullRequests } from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { getProvider } from "@/lib/agents/providers";
import { encryptSecret, maskSecret, randomToken, sha256Hex } from "@/lib/crypto";
import { secret } from "@/lib/env";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { assertProject } from "@/lib/authz";
import { notify } from "@/lib/notify";
import { githubConfig } from "@/lib/github/config";
import { createPullRequest, installationToken } from "@/lib/github/app";
import { track } from "@/lib/analytics";

const credSchema = z.object({ providerId: z.enum(["anthropic", "openai"]), apiKey: z.string().trim().min(20).max(400), label: z.string().trim().max(60).default("") });

/** Validates the key against the provider's official API, then stores it AES-GCM encrypted. The key never returns to the browser. */
export async function addAgentCredential(raw: unknown): Promise<ActionResult<{ detail: string }>> {
  return run(async () => {
    const v = await activeViewer("agent-cred", 5, 600);
    const input = credSchema.parse(raw);
    const key = secret("CREDENTIAL_ENCRYPTION_KEY");
    if (!key) throw new ActionError("Credential storage isn't configured on this server.");
    const provider = getProvider(input.providerId)!;
    const result = await provider.validateCredentials(input.apiKey);
    if (!result.ok) throw new ActionError(result.error);
    const db = getDb();
    await db.insert(userAgentConnections).values({
      id: newId(),
      userId: v.id,
      providerId: input.providerId,
      label: input.label || provider.name,
      encryptedSecret: await encryptSecret(input.apiKey, key, v.id),
      secretHint: maskSecret(input.apiKey),
      status: "active",
      lastValidatedAt: new Date(),
    });
    await audit(db, { actorId: v.id, action: "agent.credential_add", entityType: "agent_connection", entityId: input.providerId });
    revalidatePath("/settings/agents");
    return ok({ detail: result.detail }, "Key verified and stored encrypted.");
  });
}

export async function revokeAgentCredential(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("agent-cred", 20, 600);
    const db = getDb();
    const res = await db
      .update(userAgentConnections)
      .set({ status: "revoked", revokedAt: new Date(), encryptedSecret: "" })
      .where(and(eq(userAgentConnections.id, id), eq(userAgentConnections.userId, v.id)))
      .returning({ id: userAgentConnections.id });
    if (!res.length) throw new ActionError("Connection not found.");
    await audit(db, { actorId: v.id, action: "agent.credential_revoke", entityType: "agent_connection", entityId: id });
    revalidatePath("/settings/agents");
    return ok(null, "Key deleted. Also revoke it in the provider's console if it may have leaked.");
  });
}

const tokenSchema = z.object({
  name: z.string().trim().min(2).max(60),
  write: z.boolean(),
  projectIds: z.array(z.string().uuid()).max(50).nullable(),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
});

/** Creates a scoped MCP access token. Only its SHA-256 hash is stored; the plaintext is returned exactly once. */
export async function createMcpToken(raw: unknown): Promise<ActionResult<{ token: string }>> {
  return run(async () => {
    const v = await activeViewer("mcp-token", 10, 3600);
    const input = tokenSchema.parse(raw);
    const db = getDb();
    if (input.projectIds) for (const pid of input.projectIds) await assertProject(pid, v.id, "project.view", db);
    const active = await db.select({ id: mcpTokens.id }).from(mcpTokens).where(and(eq(mcpTokens.userId, v.id), isNull(mcpTokens.revokedAt)));
    if (active.length >= 10) throw new ActionError("You can have at most 10 active tokens. Revoke one first.");
    const token = `cg_mcp_${randomToken(32)}`;
    await db.insert(mcpTokens).values({
      id: newId(),
      userId: v.id,
      name: input.name,
      tokenHash: await sha256Hex(token),
      tokenPrefix: token.slice(0, 14),
      scopes: JSON.stringify(input.write ? ["read", "write"] : ["read"]),
      projectIds: input.projectIds ? JSON.stringify(input.projectIds) : null,
      expiresAt: new Date(Date.now() + input.expiresInDays * 86400_000),
    });
    await audit(db, { actorId: v.id, action: "mcp.token_create", entityType: "mcp_token", entityId: token.slice(0, 14), metadata: { write: input.write, scoped: Boolean(input.projectIds) } });
    revalidatePath("/settings/agents");
    return ok({ token }, "Token created — copy it now, it won't be shown again.");
  });
}

export async function revokeMcpToken(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("mcp-token", 30, 3600);
    const db = getDb();
    const res = await db.update(mcpTokens).set({ revokedAt: new Date() }).where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, v.id))).returning({ id: mcpTokens.id });
    if (!res.length) throw new ActionError("Token not found.");
    await audit(db, { actorId: v.id, action: "mcp.token_revoke", entityType: "mcp_token", entityId: id });
    revalidatePath("/settings/agents");
    return ok(null, "Token revoked. Agents using it lose access immediately.");
  });
}

type ContributionPayload = { taskId: string; summary: string; link?: string; branch?: string; authorship: "ai_assisted" | "agent_generated"; agentLabel: string };
type UpdatePayload = { title: string; body: string };

/**
 * A human decides on what an agent asked to do. Approval executes the action with the
 * *approver's* authority re-checked now (not the agent's), so prompt-injected requests
 * can never exceed what the approving human may do.
 */
export async function decideApproval(approvalId: string, decision: "approved" | "rejected"): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("approval", 60, 600);
    const db = getDb();
    const [a] = await db.select().from(agentApprovals).where(eq(agentApprovals.id, approvalId)).limit(1);
    if (!a) throw new ActionError("Request not found.");
    // The person whose agent did the work reviews it first (and opens the PR); project admins can also decide.
    const isRequester = a.requestedBy === v.id && a.action === "submit_contribution";
    const access = await assertProject(a.projectId, v.id, isRequester ? "task.work" : "approval.decide", db);
    if (a.status !== "pending") throw new ActionError(`Already ${a.status}.`);
    let resultRef: string | null = null;

    if (decision === "approved") {
      if (a.action === "submit_contribution") {
        const p = JSON.parse(a.payload) as ContributionPayload;
        const [t] = await db.select().from(tasks).where(and(eq(tasks.id, p.taskId), eq(tasks.projectId, a.projectId))).limit(1);
        if (!t) throw new ActionError("The task no longer exists.");
        if (t.assigneeId !== a.requestedBy) throw new ActionError("The requester is no longer assigned to this task.");
        let link = p.link ?? null;
        if (p.branch) {
          // Open a PR from the agent's branch. Never merges; branch protection stays in force on GitHub.
          const cfg = githubConfig();
          const [repo] = await db.select().from(projectRepositories).where(eq(projectRepositories.projectId, a.projectId)).limit(1);
          if (!cfg || !repo) throw new ActionError("This project has no linked GitHub repository to open a pull request in.");
          const token = await installationToken(cfg, repo.installationId, { repositoryIds: [Number(repo.repoId)], permissions: { pull_requests: "write", contents: "read", metadata: "read" } });
          const pr = await createPullRequest(token, repo.fullName, {
            title: t.title,
            head: p.branch,
            base: repo.defaultBranch,
            body: `${p.summary}\n\n---\nAuthorship: ${p.authorship === "agent_generated" ? "agent-generated" : "AI-assisted"} (${p.agentLabel}). Approved in CommonGround by ${v.profile.displayName}.\nCommonGround-Task: ${t.id}`,
            draft: false,
          });
          await db.insert(githubPullRequests).values({ id: newId(), projectRepositoryId: repo.id, taskId: t.id, number: pr.number, title: pr.title, state: "open", headRef: pr.head.ref, baseRef: pr.base.ref, headSha: pr.head.sha, htmlUrl: pr.html_url, authorLogin: pr.user.login }).onConflictDoNothing();
          link = pr.html_url;
          await track(db, "github.pr_opened", v.id, { projectId: a.projectId, via: "approval" });
          await recordActivity(db, { projectId: a.projectId, actorId: v.id, kind: "github", message: `${v.profile.displayName} shared the changes for “${t.title}” for review`, url: `/p/${access.project.slug}/build`, taskId: t.id });
          const admins = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.projectId, a.projectId), inArray(projectMembers.role, ["owner", "admin"])));
          await notify(db, admins.filter((m) => m.userId !== v.id).map((m) => ({ userId: m.userId, actorId: v.id, type: "pull_request" as const, title: `Please review the changes for “${t.title}”`, body: `Pull request #${pr.number}`, url: `/p/${access.project.slug}/build`, projectId: a.projectId })));
        }
        const sid = newId();
        await db.batch([
          db.insert(taskSubmissions).values({ id: sid, taskId: t.id, submitterId: a.requestedBy, summary: p.summary, link, authorship: p.authorship, agentLabel: p.agentLabel }),
          db.update(tasks).set({ status: "in_review", updatedAt: new Date() }).where(eq(tasks.id, t.id)),
        ]);
        resultRef = sid;
        const runId = (JSON.parse(a.payload) as { runId?: string }).runId;
        if (runId) await db.update(agentRuns).set({ status: p.branch ? "pr_created" : "completed", finishedAt: new Date() }).where(eq(agentRuns.id, runId));
        if (!p.branch) await recordActivity(db, { projectId: a.projectId, actorId: a.requestedBy, kind: "task_submitted", message: `“${t.title}” is ready for the team's review`, url: `/p/${access.project.slug}/tasks/${t.id}`, taskId: t.id });
      } else if (a.action === "add_project_update") {
        if (!access.can("update.post")) throw new ActionError("You can't post updates in this project.");
        const p = JSON.parse(a.payload) as UpdatePayload;
        const id = newId();
        await db.insert(projectUpdates).values({ id, projectId: a.projectId, authorId: a.requestedBy, title: p.title, body: p.body, source: "agent" });
        resultRef = id;
      } else throw new ActionError("Unknown request type.");
    }
    await db.update(agentApprovals).set({ status: decision, decidedBy: v.id, decidedAt: new Date(), resultRef }).where(eq(agentApprovals.id, a.id));
    if (a.sessionId) await db.insert(agentRunEvents).values({ id: newId(), sessionId: a.sessionId, type: "status", message: `${v.profile.displayName} ${decision} “${a.summary}”` });
    await audit(db, { actorId: v.id, action: `approval.${decision}`, entityType: "agent_approval", entityId: a.id, projectId: a.projectId, metadata: { action: a.action } });
    await notify(db, [{ userId: a.requestedBy, actorId: v.id, type: "agent_result", title: `Agent request ${decision}: ${a.summary}`, url: `/p/${access.project.slug}/build`, projectId: a.projectId }]);
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, decision === "approved" ? "Approved." : "Rejected.");
  });
}

