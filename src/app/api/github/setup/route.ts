import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { account, githubInstallations } from "@/db/schema";
import { githubConfig } from "@/lib/github/config";
import { getInstallation, userInstallations } from "@/lib/github/app";
import { appUrl } from "@/lib/env";
import { audit } from "@/lib/audit";
import { safeNext } from "@/lib/safe-next";

/**
 * GitHub App "Setup URL" callback: GitHub redirects here after install with ?installation_id=…&setup_action=install&state=…
 * The installation id in the query string is attacker-controllable, so we only record it after confirming —
 * with the user's own GitHub token — that this user can actually access it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = safeNext(url.searchParams.get("state"), "/settings/agents");
  const to = (path: string, params: Record<string, string>) => NextResponse.redirect(`${appUrl()}${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`);
  const cfg = githubConfig();
  if (!cfg) return to(back, { github: "not_configured" });
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(`${appUrl()}/sign-in?next=${encodeURIComponent(url.pathname + url.search)}`);
  const installationId = url.searchParams.get("installation_id");
  if (!installationId || !/^\d+$/.test(installationId)) return to(back, { github: "missing_installation" });

  const db = getDb();
  const [acc] = await db.select({ id: account.id }).from(account).where(and(eq(account.userId, session.user.id), eq(account.providerId, "github"))).limit(1);
  if (!acc) return to(back, { github: "link_account" });
  const tokenRes = await getAuth().api.getAccessToken({ body: { accountId: acc.id }, headers: await headers() }).catch(() => null);
  if (!tokenRes?.accessToken) return to(back, { github: "link_account" });
  const mine = await userInstallations(tokenRes.accessToken).catch(() => null);
  if (!mine?.installations.some((i) => String(i.id) === installationId)) return to(back, { github: "not_yours" });

  const inst = await getInstallation(cfg, installationId);
  await db
    .insert(githubInstallations)
    .values({ id: installationId, accountLogin: inst.account?.login ?? "unknown", accountType: inst.account?.type ?? "User", installedByUserId: session.user.id, repositorySelection: inst.repository_selection, suspendedAt: inst.suspended_at ? new Date(inst.suspended_at) : null })
    .onConflictDoUpdate({ target: githubInstallations.id, set: { accountLogin: inst.account?.login ?? "unknown", installedByUserId: session.user.id, deletedAt: null, updatedAt: new Date() } });
  await audit(db, { actorId: session.user.id, action: "github.install", entityType: "github_installation", entityId: installationId });
  return to(back, { github: "installed" });
}
