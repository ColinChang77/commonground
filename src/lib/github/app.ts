/**
 * GitHub App client (REST, API version 2022-11-28). No SDK dependency: every call is a
 * documented REST endpoint, authenticated either with a short-lived App JWT (RS256) or an
 * installation access token scoped down to a single repository and the minimum permissions.
 *
 * Docs:
 *  - JWT:                https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 *  - Installation token: https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app
 */
import { b64url, b64decode } from "@/lib/crypto";

export const GITHUB_API = "https://api.github.com";

export type GitHubConfig = { appId: string; privateKey: string; slug: string; webhookSecret: string };

export class GitHubError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

function pemToPkcs8(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n");
  if (normalized.includes("BEGIN RSA PRIVATE KEY"))
    throw new Error("GITHUB_APP_PRIVATE_KEY is PKCS#1. Convert it: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem");
  const body = normalized.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return b64decode(body);
}

export async function createAppJwt(appId: string, privateKeyPem: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(privateKeyPem) as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  // iat backdated 60s for clock drift; GitHub caps exp at 10 minutes.
  const payload = b64url(enc.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function gh<T = unknown>(token: string, path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...rest,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CommonGround-App",
      Authorization: `Bearer ${token}`,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new GitHubError(res.status, (data as { message?: string })?.message ?? `GitHub request failed (${res.status})`, data);
  return data as T;
}

export type RepoPermissions = Partial<Record<"contents" | "issues" | "pull_requests" | "metadata" | "administration" | "deployments", "read" | "write">>;

/** Mints an installation token restricted to the given repositories and permissions (least privilege). */
export async function installationToken(cfg: GitHubConfig, installationId: string, opts: { repositoryIds?: number[]; permissions?: RepoPermissions } = {}) {
  const jwt = await createAppJwt(cfg.appId, cfg.privateKey);
  const body: Record<string, unknown> = {};
  if (opts.repositoryIds?.length) body.repository_ids = opts.repositoryIds;
  if (opts.permissions) body.permissions = opts.permissions;
  const res = await gh<{ token: string; expires_at: string }>(jwt, `/app/installations/${encodeURIComponent(installationId)}/access_tokens`, { method: "POST", json: body });
  return res.token;
}

export type GhInstallation = { id: number; account: { login: string; type: string } | null; repository_selection: string; suspended_at: string | null };
export type GhRepo = { id: number; name: string; full_name: string; private: boolean; default_branch: string; html_url: string; description: string | null; owner: { login: string } };

export async function getInstallation(cfg: GitHubConfig, installationId: string) {
  return gh<GhInstallation>(await createAppJwt(cfg.appId, cfg.privateKey), `/app/installations/${encodeURIComponent(installationId)}`);
}

/** Installations the signed-in GitHub user can access (requires a GitHub App user access token). */
export async function userInstallations(userToken: string) {
  return gh<{ total_count: number; installations: GhInstallation[] }>(userToken, `/user/installations?per_page=100`);
}

export async function installationRepos(cfg: GitHubConfig, installationId: string) {
  const token = await installationToken(cfg, installationId, { permissions: { metadata: "read" } });
  const out: GhRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await gh<{ repositories: GhRepo[]; total_count: number }>(token, `/installation/repositories?per_page=100&page=${page}`);
    out.push(...res.repositories);
    if (out.length >= res.total_count || res.repositories.length === 0) break;
  }
  return out;
}

export function splitRepo(fullName: string) {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`Bad repository name: ${fullName}`);
  return { owner: encodeURIComponent(owner), repo: encodeURIComponent(repo) };
}

export async function createIssue(token: string, fullName: string, issue: { title: string; body: string; labels?: string[] }) {
  const { owner, repo } = splitRepo(fullName);
  return gh<{ number: number; html_url: string; state: string; title: string }>(token, `/repos/${owner}/${repo}/issues`, { method: "POST", json: issue });
}

export async function getBranchSha(token: string, fullName: string, branch: string) {
  const { owner, repo } = splitRepo(fullName);
  const ref = await gh<{ object: { sha: string } }>(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  return ref.object.sha;
}

export async function createBranch(token: string, fullName: string, branch: string, fromSha: string) {
  const { owner, repo } = splitRepo(fullName);
  return gh(token, `/repos/${owner}/${repo}/git/refs`, { method: "POST", json: { ref: `refs/heads/${branch}`, sha: fromSha } });
}

export type GhCompare = { status: string; ahead_by: number; behind_by: number; total_commits: number; commits: { sha: string; commit: { message: string; author: { name: string } | null } }[]; files?: { filename: string; status: string; additions: number; deletions: number; patch?: string }[] };

export async function compareBranches(token: string, fullName: string, base: string, head: string) {
  const { owner, repo } = splitRepo(fullName);
  return gh<GhCompare>(token, `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
}

export async function createPullRequest(token: string, fullName: string, pr: { title: string; head: string; base: string; body: string; draft?: boolean }) {
  const { owner, repo } = splitRepo(fullName);
  return gh<{ number: number; html_url: string; state: string; title: string; head: { ref: string; sha: string }; base: { ref: string }; user: { login: string } }>(
    token,
    `/repos/${owner}/${repo}/pulls`,
    { method: "POST", json: { ...pr, maintainer_can_modify: true } },
  );
}

/** Organization repos can be created with an installation token that has Administration: write. */
export async function createOrgRepository(token: string, org: string, repo: { name: string; description: string; private: boolean }) {
  return gh<GhRepo>(token, `/orgs/${encodeURIComponent(org)}/repos`, { method: "POST", json: { ...repo, auto_init: true } });
}

/** Branch names CommonGround creates/recognizes for task work. */
export function taskBranchName(taskId: string, title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `cg/${taskId.slice(0, 8)}-${slug || "task"}`;
}

export function taskIdPrefixFromBranch(ref: string): string | null {
  const m = /^cg\/([0-9a-f]{8})(?:-|$)/.exec(ref);
  return m ? m[1] : null;
}
