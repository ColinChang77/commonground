import Anthropic from "@anthropic-ai/sdk";
import type { AgentProvider, ExecutionBackend, ExecutionUnavailable, RunEvent, TaskSpec, ValidationResult } from "@/lib/agents/types";

const UNAVAILABLE: ExecutionUnavailable = {
  ok: false,
  code: "execution_backend_unavailable",
  message:
    "Hosted agent runs need an isolated execution backend (ephemeral sandbox with resource, network and time limits). None is configured on this deployment, so CommonGround will not run agents here. Use “Bring your own agent” via MCP instead.",
};

abstract class BaseProvider implements AgentProvider {
  abstract readonly id: "anthropic" | "openai";
  abstract readonly name: string;
  abstract readonly defaultModel: string;
  constructor(protected backend: ExecutionBackend | null) {}
  abstract validateCredentials(secret: string): Promise<ValidationResult>;
  async createSession() {
    return this.backend ? ({ ok: true } as const) : UNAVAILABLE;
  }
  async executeTask(spec: TaskSpec) {
    if (!this.backend) return UNAVAILABLE;
    const { workspaceId } = await this.backend.provision(spec);
    return { ok: true as const, workspaceId };
  }
  async *streamEvents(workspaceId: string): AsyncIterable<RunEvent> {
    if (!this.backend) return;
    yield* this.backend.stream(workspaceId);
  }
  async requestApproval() {
    /* approvals are persisted by the platform (agent_approvals); providers don't own them */
  }
  async cancelExecution(workspaceId: string) {
    await this.backend?.cancel(workspaceId);
  }
  async getExecutionStatus() {
    return { status: this.backend ? "unknown" : "blocked" };
  }
}

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic" as const;
  readonly name = "Claude (Anthropic API)";
  readonly defaultModel = "claude-opus-5-5";
  async validateCredentials(secret: string): Promise<ValidationResult> {
    const client = new Anthropic({ apiKey: secret, maxRetries: 1, timeout: 15_000 });
    try {
      const models: string[] = [];
      for await (const m of client.models.list({ limit: 20 })) {
        models.push(m.id);
        if (models.length >= 20) break;
      }
      return { ok: true, detail: `Key accepted by the Anthropic API (${models.length} models visible).`, models };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "Anthropic rejected this API key." };
      if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "This key doesn't have permission to use the API." };
      if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Anthropic rate-limited the check. Try again in a minute." };
      if (e instanceof Anthropic.APIError) return { ok: false, error: `Anthropic API error (${e.status ?? "network"}).` };
      return { ok: false, error: "Couldn't reach the Anthropic API." };
    }
  }
}

export class OpenAIProvider extends BaseProvider {
  readonly id = "openai" as const;
  readonly name = "OpenAI (Codex / API)";
  readonly defaultModel = "";
  async validateCredentials(secret: string): Promise<ValidationResult> {
    try {
      const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${secret}` } });
      if (res.status === 401) return { ok: false, error: "OpenAI rejected this API key." };
      if (res.status === 429) return { ok: false, error: "OpenAI rate-limited the check. Try again in a minute." };
      if (!res.ok) return { ok: false, error: `OpenAI API error (${res.status}).` };
      const body = (await res.json()) as { data?: { id: string }[] };
      return { ok: true, detail: `Key accepted by the OpenAI API (${body.data?.length ?? 0} models visible).` };
    } catch {
      return { ok: false, error: "Couldn't reach the OpenAI API." };
    }
  }
}

/** No isolated execution backend ships with this deployment (see docs/AGENTS.md). */
export function getProvider(id: string, backend: ExecutionBackend | null = null): AgentProvider | null {
  if (id === "anthropic") return new AnthropicProvider(backend);
  if (id === "openai") return new OpenAIProvider(backend);
  return null;
}

export const HOSTED_EXECUTION_UNAVAILABLE = UNAVAILABLE;
