import "server-only";
import { getEnv, secret, type AppEnv } from "@/lib/env";
import type { GitHubConfig } from "@/lib/github/app";

export function githubConfig(env: AppEnv = getEnv()): GitHubConfig | null {
  const appId = secret("GITHUB_APP_ID", env);
  const privateKey = secret("GITHUB_APP_PRIVATE_KEY", env);
  const slug = secret("GITHUB_APP_SLUG", env);
  const webhookSecret = secret("GITHUB_WEBHOOK_SECRET", env);
  if (!appId || !privateKey || !slug || !webhookSecret) return null;
  return { appId, privateKey, slug, webhookSecret };
}

export function installUrl(cfg: GitHubConfig, state: string) {
  return `https://github.com/apps/${encodeURIComponent(cfg.slug)}/installations/new?state=${encodeURIComponent(state)}`;
}
