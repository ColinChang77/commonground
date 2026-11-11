"use client";
import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { addAgentCredential, createMcpToken, revokeAgentCredential, revokeMcpToken } from "@/server/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { useAction } from "@/components/use-action";

export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-muted p-3 pr-12 font-mono text-xs leading-relaxed" aria-label={label}>{text}</pre>
      <button type="button" aria-label={`Copy ${label}`} className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-lg bg-background/80 hover:bg-background" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

export function AddCredential() {
  const { exec, pending } = useAction();
  const [providerId, setProvider] = useState("anthropic");
  const [apiKey, setKey] = useState("");
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); const r = await exec(() => addAgentCredential({ providerId, apiKey, label: "" })); if (r.ok) setKey(""); }}>
      <div className="flex flex-wrap gap-2">
        <Select value={providerId} onValueChange={setProvider}>
          <SelectTrigger aria-label="Provider" className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="anthropic">Anthropic API key</SelectItem><SelectItem value="openai">OpenAI API key</SelectItem></SelectContent>
        </Select>
        <Input type="password" autoComplete="off" aria-label="API key" placeholder={providerId === "anthropic" ? "sk-ant-…" : "sk-…"} value={apiKey} onChange={(e) => setKey(e.target.value)} className="min-w-56 flex-1 font-mono" />
        <Button type="submit" disabled={pending || apiKey.trim().length < 20}><KeyRound /> {pending ? "Verifying…" : "Verify & save"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">We check the key with the provider&apos;s official API, then store it encrypted (AES-256-GCM). It&apos;s never sent back to your browser. Only developer API keys work here — ChatGPT, Claude Pro or Max subscriptions can&apos;t be used by third-party services.</p>
    </form>
  );
}

export function RevokeCredential({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => revokeAgentCredential(id))}>Delete</Button>;
}

export function NewMcpToken({ projects, appUrl }: { projects: { id: string; title: string }[]; appUrl: string }) {
  const { exec, pending } = useAction();
  const [name, setName] = useState("Claude Code on my laptop");
  const [write, setWrite] = useState(true);
  const [scope, setScope] = useState<string>("all");
  const [days, setDays] = useState("90");
  const [token, setToken] = useState<string | null>(null);
  const url = `${appUrl}/api/mcp`;
  if (token)
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-accent/40 p-4">
        <p className="text-sm font-medium">Copy your token now — it won&apos;t be shown again.</p>
        <CopyBlock label="token" text={token} />
        <p className="text-sm">Claude Code:</p>
        <CopyBlock label="Claude Code command" text={`claude mcp add --transport http commonground ${url} \\\n  --header "Authorization: Bearer ${token}"`} />
        <p className="text-sm">Codex CLI (<code>~/.codex/config.toml</code>, then <code>export COMMONGROUND_TOKEN=…</code>):</p>
        <CopyBlock label="Codex config" text={`[mcp_servers.commonground]\nurl = "${url}"\nbearer_token_env_var = "COMMONGROUND_TOKEN"`} />
        <p className="text-sm">Any MCP client (Streamable HTTP):</p>
        <CopyBlock label="Generic MCP config" text={JSON.stringify({ mcpServers: { commonground: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)} />
        <Button variant="outline" className="self-start" onClick={() => setToken(null)}>Done</Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" htmlFor="tok-name" hint="So you can tell tokens apart later."><Input id="tok-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Projects" htmlFor="tok-scope">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger id="tok-scope" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All my projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>Only: {p.title}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Expires after" htmlFor="tok-exp">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger id="tok-exp" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{["7", "30", "90", "365"].map((d) => <SelectItem key={d} value={d}>{d} days</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <span>Allow changes<span className="block text-xs text-muted-foreground">Create/claim tasks and request approvals. Submitting work and publishing updates always need a human to approve.</span></span>
        <Switch checked={write} onCheckedChange={setWrite} aria-label="Allow changes" />
      </label>
      <Button className="self-start" disabled={pending || name.trim().length < 2} onClick={async () => {
        const r = await exec(() => createMcpToken({ name, write, projectIds: scope === "all" ? null : [scope], expiresInDays: Number(days) }), { refresh: false });
        if (r.ok) setToken(r.data.token);
      }}>Create token</Button>
    </div>
  );
}

export function RevokeToken({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={async () => { const r = await exec(() => revokeMcpToken(id)); if (!r.ok) toast.error(r.error); }}>Revoke</Button>;
}
