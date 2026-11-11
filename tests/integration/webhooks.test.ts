import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "./setup";
import { mkProject, mkTask, mkUser, addMember } from "./fixtures";
import { processWebhook, verifySignature } from "@/lib/github/webhooks";
import { hmacSha256Hex } from "@/lib/crypto";
import { contributions, githubInstallations, githubPullRequests, projectDeployments, projectRepositories, tasks } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { DB } from "@/db";

let env: Awaited<ReturnType<typeof freshDb>>;
let db: DB;
let projectId: string, taskId: string, dev: string;
const REPO_ID = 4242;

const pr = (over: Record<string, unknown> = {}) => ({
  action: "opened",
  installation: { id: 99 },
  repository: { id: REPO_ID, full_name: "acme/garden", default_branch: "main", private: false },
  pull_request: { number: 7, title: "Landing page", state: "open", merged: false, merged_at: null, html_url: "https://github.com/acme/garden/pull/7", body: `Adds the page\n\nCommonGround-Task: ${taskId}`, head: { ref: `cg/${taskId.slice(0, 8)}-landing`, sha: "abc" }, base: { ref: "main" }, user: { id: 555, login: "devgh" }, merge_commit_sha: null, ...over },
});

beforeAll(async () => {
  env = await freshDb();
  db = env.db;
  const owner = await mkUser(db, "owner");
  dev = await mkUser(db, "dev", { githubId: "555" });
  projectId = await mkProject(db, owner, "Garden");
  await addMember(db, projectId, dev, "contributor");
  taskId = await mkTask(db, projectId, owner, "Landing page", dev);
  await db.insert(githubInstallations).values({ id: "99", accountLogin: "acme", accountType: "Organization" });
  await db.insert(projectRepositories).values({ id: newId(), projectId, installationId: "99", repoId: String(REPO_ID), fullName: "acme/garden", defaultBranch: "main", isPrivate: false, linkedBy: owner });
}, 120_000);
afterAll(async () => env?.dispose());

describe("webhook signature", () => {
  it("accepts valid and rejects invalid/missing signatures", async () => {
    const body = JSON.stringify({ zen: "hi" });
    const sig = `sha256=${await hmacSha256Hex("s3cret", body)}`;
    expect(await verifySignature("s3cret", body, sig)).toBe(true);
    expect(await verifySignature("wrong", body, sig)).toBe(false);
    expect(await verifySignature("s3cret", body + " ", sig)).toBe(false);
    expect(await verifySignature("s3cret", body, null)).toBe(false);
    expect(await verifySignature("s3cret", body, "sha1=abc")).toBe(false);
  });
});

describe("webhook processing", () => {
  it("syncs an opened PR and links it to the task", async () => {
    expect((await processWebhook(db, "d-1", "pull_request", pr())).status).toBe("processed");
    const [row] = await db.select().from(githubPullRequests);
    expect(row.number).toBe(7);
    expect(row.state).toBe("open");
    expect(row.taskId).toBe(taskId);
  });
  it("ignores duplicate deliveries", async () => {
    expect((await processWebhook(db, "d-1", "pull_request", pr())).status).toBe("duplicate");
    expect(await db.select().from(githubPullRequests)).toHaveLength(1);
  });
  it("ignores repos that aren't linked", async () => {
    const out = await processWebhook(db, "d-2", "pull_request", { ...pr(), repository: { id: 1 } });
    expect(out.status).toBe("ignored");
  });
  it("on merge records a pending code contribution for the mapped member (merge alone grants no credit)", async () => {
    await processWebhook(db, "d-3", "pull_request", pr({ action: "closed", state: "closed", merged: true, merged_at: new Date().toISOString(), merge_commit_sha: "deadbeef" }));
    const [row] = await db.select().from(githubPullRequests);
    expect(row.state).toBe("merged");
    const cs = await db.select().from(contributions).where(eq(contributions.projectId, projectId));
    expect(cs).toHaveLength(1);
    expect(cs[0].userId).toBe(dev);
    expect(cs[0].status).toBe("pending");
    expect(cs[0].type).toBe("code");
    expect(JSON.parse(cs[0].commitShas)).toEqual(["deadbeef"]);
    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(t.status).toBe("in_review");
    // A redelivered merge must not create a second record
    await processWebhook(db, "d-4", "pull_request", pr({ action: "closed", state: "closed", merged: true, merged_at: new Date().toISOString(), merge_commit_sha: "deadbeef" }));
    expect(await db.select().from(contributions)).toHaveLength(1);
  });
  it("a merge by a project admin who isn't the author verifies the contribution and completes the to-do", async () => {
    const owner2 = await mkUser(db, "owner2", { githubId: "777" });
    const dev2 = await mkUser(db, "dev2", { githubId: "888" });
    await addMember(db, projectId, owner2, "admin");
    await addMember(db, projectId, dev2, "contributor");
    const t2 = await mkTask(db, projectId, owner2, "Signup page", dev2);
    await processWebhook(db, "d-10", "pull_request", pr({ number: 9, title: "Signup page", body: `CommonGround-Task: ${t2}`, head: { ref: "cg/x-signup", sha: "s9" }, user: { id: 888, login: "dev2gh" }, action: "opened" }));
    await processWebhook(db, "d-11", "pull_request", pr({ number: 9, title: "Signup page", body: `CommonGround-Task: ${t2}`, head: { ref: "cg/x-signup", sha: "s9" }, user: { id: 888, login: "dev2gh" }, action: "closed", state: "closed", merged: true, merged_at: new Date().toISOString(), merge_commit_sha: "m9", merged_by: { id: 777, login: "owner2gh" } }));
    const [c] = await db.select().from(contributions).where(eq(contributions.userId, dev2));
    expect(c.status).toBe("verified");
    expect(c.verifiedBy).toBe(owner2);
    const [t] = await db.select().from(tasks).where(eq(tasks.id, t2));
    expect(t.status).toBe("done");
  });
  it("records deployment statuses as preview deployments", async () => {
    await processWebhook(db, "d-5", "deployment_status", { installation: { id: 99 }, repository: { id: REPO_ID }, deployment: { id: 11, environment: "Preview", sha: "abc", ref: "cg/x" }, deployment_status: { state: "success", environment_url: "https://garden-git-x.vercel.app", log_url: "https://vercel.com/logs" } });
    const [d] = await db.select().from(projectDeployments);
    expect(d.url).toBe("https://garden-git-x.vercel.app");
    expect(d.state).toBe("success");
  });
  it("unlinks repositories when the installation loses access", async () => {
    await processWebhook(db, "d-6", "installation_repositories", { installation: { id: 99 }, repositories_removed: [{ id: REPO_ID }] });
    expect(await db.select().from(projectRepositories)).toHaveLength(0);
  });
});
