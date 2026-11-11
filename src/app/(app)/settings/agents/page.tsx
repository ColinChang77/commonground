import { and, desc, eq, isNull } from "drizzle-orm";
import { Bot, GitBranch as Github, PlugZap } from "lucide-react";
import { getDb } from "@/db";
import { githubInstallations, mcpTokens, projectMembers, projects, userAgentConnections } from "@/db/schema";
import { requireViewer } from "@/lib/session";
import { appUrl } from "@/lib/env";
import { githubConfig, installUrl } from "@/lib/github/config";
import { SettingsSection } from "@/components/settings-section";
import { nowMs } from "@/lib/clock";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { AddCredential, NewMcpToken, RevokeCredential, RevokeToken } from "@/components/settings/agents-ui";

export const metadata = { title: "Connected agents" };

const GH_MSG: Record<string, string> = {
  installed: "GitHub App installed. Open a software project's Build tab to link a repository.",
  link_account: "Connect your GitHub account (Settings → Account) so we can confirm the installation is yours, then try again.",
  not_yours: "That installation isn't accessible from your GitHub account, so it wasn't connected.",
  not_configured: "The GitHub App isn't configured on this server.",
  missing_installation: "GitHub didn't send an installation id.",
};

export default async function AgentsSettings({ searchParams }: { searchParams: Promise<{ github?: string }> }) {
  const v = await requireViewer("/settings/agents");
  const gh = (await searchParams).github;
  const db = getDb();
  const creds = await db.select({ id: userAgentConnections.id, providerId: userAgentConnections.providerId, label: userAgentConnections.label, hint: userAgentConnections.secretHint, status: userAgentConnections.status, lastValidatedAt: userAgentConnections.lastValidatedAt }).from(userAgentConnections).where(and(eq(userAgentConnections.userId, v.id), eq(userAgentConnections.status, "active")));
  const tokens = await db.select().from(mcpTokens).where(and(eq(mcpTokens.userId, v.id), isNull(mcpTokens.revokedAt))).orderBy(desc(mcpTokens.createdAt));
  const myProjects = await db.select({ id: projects.id, title: projects.title }).from(projects).innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, v.id)));
  const installs = await db.select().from(githubInstallations).where(and(eq(githubInstallations.installedByUserId, v.id), isNull(githubInstallations.deletedAt)));
  const cfg = githubConfig();
  return (
    <div className="flex flex-col gap-5">
      {gh && GH_MSG[gh] && <p role="status" className="rounded-xl border bg-accent/50 px-4 py-3 text-sm">{GH_MSG[gh]}</p>}
      <SettingsSection icon={PlugZap} title="Bring your own agent (MCP)" desc="Use Claude Code, Codex CLI or any MCP-compatible agent with your CommonGround projects. The agent sees only projects you're a member of, with your role's permissions.">
        {tokens.length > 0 && (
          <ul className="mb-5 flex flex-col divide-y rounded-xl border">
            {tokens.map((t) => {
              const expired = t.expiresAt && t.expiresAt.getTime() < nowMs();
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-medium">{t.name}</span> <code className="text-xs text-muted-foreground">{t.tokenPrefix}…</code>
                    <span className="block text-xs text-muted-foreground">
                      {JSON.parse(t.scopes).includes("write") ? "Read & request changes" : "Read only"} · {t.projectIds ? `${JSON.parse(t.projectIds).length} project` : "all projects"} · {expired ? <span className="text-destructive">expired</span> : <>expires {t.expiresAt?.toLocaleDateString("en")}</>}
                    </span>
                  </span>
                  <span className="text-xs">{t.lastUsedAt ? <span className="text-success">Connected — last used <TimeAgo date={t.lastUsedAt} />{t.lastClient ? ` by ${t.lastClient.split(" ")[0]}` : ""}</span> : <span className="text-muted-foreground">Not connected yet</span>}</span>
                  <RevokeToken id={t.id} />
                </li>
              );
            })}
          </ul>
        )}
        <NewMcpToken projects={myProjects} appUrl={appUrl()} />
      </SettingsSection>
      <SettingsSection icon={Github} title="GitHub" desc="The CommonGround GitHub App links repositories to projects, syncs issues and pull requests, and opens PRs after a human approves agent work.">
        {!cfg ? <p className="text-sm text-muted-foreground">Not configured on this server yet.</p> : (
          <div className="flex flex-col gap-3 text-sm">
            {installs.length ? <ul className="flex flex-col gap-1">{installs.map((i) => <li key={i.id}>Installed on <strong>{i.accountLogin}</strong> ({i.accountType}){i.suspendedAt ? " — suspended" : ""}</li>)}</ul> : <p className="text-muted-foreground">Not installed yet.</p>}
            <Button asChild size="sm" variant="outline" className="self-start"><a href={installUrl(cfg, "/settings/agents")}>{installs.length ? "Install on another account" : "Install GitHub App"}</a></Button>
          </div>
        )}
      </SettingsSection>
      <SettingsSection icon={Bot} title="Hosted agents (API keys)" desc="Store a developer API key so hosted agent runs can be billed to your own provider account. Hosted runs are currently unavailable on this deployment — no isolated execution sandbox is configured — so keys are stored but not used yet.">
        {creds.length > 0 && (
          <ul className="mb-4 flex flex-col divide-y rounded-xl border">
            {creds.map((c) => <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="flex-1"><span className="font-medium">{c.label}</span> <code className="text-xs text-muted-foreground">{c.hint}</code><span className="block text-xs text-success">Verified {c.lastValidatedAt ? <TimeAgo date={c.lastValidatedAt} /> : ""}</span></span><RevokeCredential id={c.id} /></li>)}
          </ul>
        )}
        <AddCredential />
      </SettingsSection>
    </div>
  );
}
