import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AppEnv = CloudflareEnv;

export function getEnv(): AppEnv {
  return getCloudflareContext().env as AppEnv;
}

export function isProduction(env: AppEnv = getEnv()) {
  return env.ENVIRONMENT === "production";
}

export function appUrl(env: AppEnv = getEnv()) {
  return (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Returns a non-empty secret or null. */
export function secret(name: keyof AppEnv, env: AppEnv = getEnv()): string | null {
  const v = env[name];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** R2 bucket for images, or null when R2 isn't enabled on this deployment. */
export function mediaBucket(env: AppEnv = getEnv()): R2Bucket | null {
  return (env as unknown as { MEDIA?: R2Bucket }).MEDIA ?? null;
}
