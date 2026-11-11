"use server";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { account, githubInstallations, githubIssues, githubPullRequests, projectRepositories, tasks } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { assertProject } from "@/lib/authz";
import { getAuth } from "@/lib/auth";
import { githubConfig } from "@/lib/github/config";
import { createIssue, createOrgRepository, gh, GitHubError, installationRepos, installationToken, splitRepo, userInstallations, type GhRepo } from "@/lib/github/app";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/env";

function cfgOrThrow() {
  const cfg = githubConfig();
  if (!cfg) throw new ActionError("The GitHub App isn't configured on this server yet.");
  return cfg;
}

/** A GitHub App user access token for the signed-in user (via their linked GitHub account). */
export async function githubUserToken(userId: string): Promise<string | null> {
  const [acc] = await getDb().select({ id: account.id }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "github"))).limit(1);
  if (!acc) return null;
  try {
    const res = await getAuth().api.getAccessToken({ body: { accountId: acc.id }, headers: await headers() });
    return res?.accessToken ?? null;
  } catch {
    return null;
  }
}

/** Installations this user may use: ones they installed through CommonGround, re-verified against GitHub when possible. */
async function assertInstallationAccess(userId: string, installationId: string) {
  const db = getDb();
  const [inst] = await db.select().from(githubInstallations).where(and(eq(githubInstallations.id, installationId), isNull(githubInstallations.deletedAt))).limit(1);
  if (!inst) throw new ActionError("That GitHub installation isn't connected.");
  if (inst.suspendedAt) throw new ActionError("That GitHub installation is suspended.");
  const token = await githubUserToken(userId);
  if (token) {
    const mine = await userInstallations(token);
    if (!mine.installations.some((i) => String(i.id) === installationId)) throw new ActionError("Your GitHub account doesn't have access to that installation.");
  } else if (inst.installedByUserId !== userId) {
    throw new ActionError("Connect your GitHub account to use this installation.");
  }
  return inst;
}

export async function listInstallationRepositories(installationId: string): Promise<ActionResult<{ repos: Pick<GhRepo, "id" | "full_name" | "private" | "default_branch">[] }>> {
  return run(async () => {
    const v = await activeViewer("gh-list", 30, 300);
    const cfg = cfgOrThrow();
    await assertInstallationAccess(v.id, installationId);
    const repos = await installationRepos(cfg, installationId);
    return ok({ repos: repos.map((r) => ({ id: r.id, full_name: r.full_name, private: r.private, default_branch: r.default_branch })) });
  });
}

export async function linkRepository(projectId: string, installationId: string, repoId: number): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("gh-link", 10, 600);
    const cfg = cfgOrThrow();
    const db = getDb();
    const access = await assertProject(projectId, v.id, "repo.manage", db);
    await assertInstallationAccess(v.id, installationId);
    // Never trust the client's repo id: confirm the installation can actually see it.
    const repo = (await installationRepos(cfg, installationId)).find((r) => r.id === repoId);
    if (!repo) throw new ActionError("That repository isn't available to the CommonGround GitHub App. Grant it access on GitHub first.");
    const [taken] = await db.select({ projectId: projectRepositories.projectId }).from(projectRepositories).where(eq(projectRepositories.repoId, String(repoId))).limit(1);
    if (taken && taken.projectId !== projectId) throw new ActionError("That repository is already linked to another project.");
    await db
      .insert(projectRepositories)
      .values({ id: newId(), projectId, installationId, repoId: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, isPrivate: repo.private, linkedBy: v.id })
      .onConflictDoUpdate({ target: projectRepositories.projectId, set: { installationId, repoId: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, isPrivate: repo.private, linkedBy: v.id } });
    await audit(db, { actorId: v.id, action: "repo.link", entityType: "repository", entityId: String(repo.id), projectId, metadata: { fullName: repo.full_name } });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, `Linked ${repo.full_name}.`);
  });
}

export async function unlinkRepository(projectId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("gh-link", 10, 600);
    const db = getDb();
    const access = await assertProject(projectId, v.id, "repo.manage", db);
    await db.delete(projectRepositories).where(eq(projectRepositories.projectId, projectId));
    await audit(db, { actorId: v.id, action: "repo.unlink", entityType: "project", entityId: projectId, projectId });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, "Repository unlinked. Nothing was changed on GitHub.");
  });
}

export async function createRepositoryForProject(projectId: string, installationId: string, name: string, isPrivate: boolean): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("gh-create", 3, 3600);
    const cfg = cfgOrThrow();
    const db = getDb();
    const access = await assertProject(projectId, v.id, "repo.manage", db);
    const inst = await assertInstallationAccess(v.id, installationId);
    if (inst.accountType !== "Organization") throw new ActionError("GitHub only lets apps create repositories inside organizations. Create the repo on github.com, then link it here.");
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new ActionError("Repository names can use letters, numbers, dots, dashes and underscores.");
    const token = await installationToken(cfg, installationId, { permissions: { administration: "write", metadata: "read" } });
    let repo: GhRepo;
    try {
      repo = await createOrgRepository(token, inst.accountLogin, { name, description: access.project.summary.slice(0, 300), private: isPrivate });
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) throw new ActionError("The GitHub App needs the “Administration: write” permission on this organization to create repositories.");
      if (e instanceof GitHubError && e.status === 422) throw new ActionError("A repository with that name already exists.");
      throw e;
    }
    await db.insert(projectRepositories).values({ id: newId(), projectId, installationId, repoId: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, isPrivate: repo.private, linkedBy: v.id }).onConflictDoNothing();
    await audit(db, { actorId: v.id, action: "repo.create", entityType: "repository", entityId: String(repo.id), projectId, metadata: { fullName: repo.full_name } });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, `Created ${repo.full_name}.`);
  });
}

export async function syncTaskToIssue(taskId: string): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const v = await activeViewer("gh-issue", 20, 600);
    const cfg = cfgOrThrow();
    const db = getDb();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!t) throw new ActionError("Task not found.");
    const access = await assertProject(t.projectId, v.id, "repo.manage", db);
    const [repo] = await db.select().from(projectRepositories).where(eq(projectRepositories.projectId, t.projectId)).limit(1);
    if (!repo) throw new ActionError("Link a GitHub repository first.");
    const [existing] = await db.select().from(githubIssues).where(eq(githubIssues.taskId, t.id)).limit(1);
    if (existing) return ok({ url: existing.htmlUrl }, "Already synced.");
    const token = await installationToken(cfg, repo.installationId, { repositoryIds: [Number(repo.repoId)], permissions: { issues: "write", metadata: "read" } });
    const body = `${t.description || "_No description._"}\n\n${t.deliverable ? `**Deliverable:** ${t.deliverable}\n\n` : ""}---\nTracked in CommonGround: ${appUrl()}/p/${access.project.slug}/tasks/${t.id}\nCommonGround-Task: ${t.id}`;
    const issue = await createIssue(token, repo.fullName, { title: t.title, body });
    await db.insert(githubIssues).values({ id: newId(), projectRepositoryId: repo.id, taskId: t.id, number: issue.number, title: issue.title, state: issue.state, htmlUrl: issue.html_url });
    await audit(db, { actorId: v.id, action: "github.issue_create", entityType: "task", entityId: t.id, projectId: t.projectId, metadata: { number: issue.number } });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok({ url: issue.html_url }, `Created issue #${issue.number}.`);
  });
}


/** Reviews a linked pull request with the signed-in admin's own GitHub account (respects repo permissions). */
export async function reviewPullRequest(prId: string, event: "APPROVE" | "REQUEST_CHANGES", body = ""): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("gh-review", 20, 600);
    const db = getDb();
    const [pr] = await db.select().from(githubPullRequests).where(eq(githubPullRequests.id, prId)).limit(1);
    if (!pr) throw new ActionError("Pull request not found.");
    const [repo] = await db.select().from(projectRepositories).where(eq(projectRepositories.id, pr.projectRepositoryId)).limit(1);
    if (!repo) throw new ActionError("Repository is no longer linked.");
    const access = await assertProject(repo.projectId, v.id, "contribution.verify", db);
    if (event === "REQUEST_CHANGES" && !body.trim()) throw new ActionError("Say what should change.");
    const token = await githubUserToken(v.id);
    if (!token) throw new ActionError("Connect your GitHub account (Settings → Account) to review on GitHub.");
    const { owner, repo: name } = splitRepo(repo.fullName);
    try {
      await gh(token, `/repos/${owner}/${name}/pulls/${pr.number}/reviews`, { method: "POST", json: { event, body: body || (event === "APPROVE" ? "Approved in CommonGround." : "") } });
    } catch (e) {
      if (e instanceof GitHubError) throw new ActionError(`GitHub said: ${e.message}`);
      throw e;
    }
    await recordActivity(db, { projectId: repo.projectId, actorId: v.id, kind: "github", message: event === "APPROVE" ? `${v.profile.displayName} approved the changes for “${pr.title}”` : `${v.profile.displayName} asked for changes on “${pr.title}”`, url: `/p/${access.project.slug}/build`, taskId: pr.taskId });
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, event === "APPROVE" ? "Approved on GitHub." : "Feedback sent on GitHub.");
  });
}

/** Merges via GitHub with the admin's own account. Branch protection and required reviews are enforced by GitHub. */
export async function mergePullRequest(prId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const v = await activeViewer("gh-merge", 10, 600);
    const db = getDb();
    const [pr] = await db.select().from(githubPullRequests).where(eq(githubPullRequests.id, prId)).limit(1);
    if (!pr || pr.state !== "open") throw new ActionError("This pull request isn't open.");
    const [repo] = await db.select().from(projectRepositories).where(eq(projectRepositories.id, pr.projectRepositoryId)).limit(1);
    if (!repo) throw new ActionError("Repository is no longer linked.");
    const access = await assertProject(repo.projectId, v.id, "contribution.verify", db);
    const token = await githubUserToken(v.id);
    if (!token) throw new ActionError("Connect your GitHub account (Settings → Account) to merge.");
    const { owner, repo: name } = splitRepo(repo.fullName);
    try {
      await gh(token, `/repos/${owner}/${name}/pulls/${pr.number}/merge`, { method: "PUT", json: { merge_method: "squash", sha: pr.headSha ?? undefined } });
    } catch (e) {
      if (e instanceof GitHubError) throw new ActionError(e.status === 405 ? `GitHub won't merge yet: ${e.message}` : `GitHub said: ${e.message}`);
      throw e;
    }
    // The task + contribution update when GitHub's pull_request "closed/merged" webhook arrives.
    revalidatePath(`/p/${access.project.slug}`, "layout");
    return ok(null, "Merge requested — CommonGround updates as soon as GitHub confirms.");
  });
}
