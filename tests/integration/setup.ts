import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getPlatformProxy } from "wrangler";
import { createDb } from "@/db";

/** Real D1 (Miniflare) with the project's migrations applied, isolated in a temp dir. */
export async function freshDb() {
  const dir = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "cg-it-"));
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "commonground", "--local", "--persist-to", dir], { stdio: "pipe", env: { ...process.env, CI: "1" } });
  const proxy = await getPlatformProxy<CloudflareEnv>({ persist: { path: path.join(dir, "v3") }, envFiles: [] });
  const db = createDb(proxy.env.DB);
  return {
    db,
    d1: proxy.env.DB,
    async dispose() {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
