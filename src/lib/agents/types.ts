/**
 * Agent provider adapter contract. Each hosted provider implements this; the platform never
 * calls a provider API directly. Only officially documented endpoints are used:
 * - Anthropic: official @anthropic-ai/sdk (`client.models.list()` for credential validation).
 * - OpenAI: documented REST `GET /v1/models` for credential validation.
 *
 * Execution (`executeTask` etc.) requires an isolated execution backend (per-run sandbox
 * with CPU/memory/time/network limits). CommonGround never runs repository code inside the
 * web application. When no backend is configured, execution methods return a typed
 * `ExecutionUnavailable` result instead of simulating progress.
 */
export type ValidationResult = { ok: true; detail: string; models?: string[] } | { ok: false; error: string };

export type RunEvent = { type: "status" | "log" | "approval_requested" | "changes_ready" | "error" | "usage"; message: string; data?: Record<string, unknown> };

export type ExecutionUnavailable = { ok: false; code: "execution_backend_unavailable"; message: string };

export type TaskSpec = {
  runId: string;
  repoFullName: string;
  baseBranch: string;
  branch: string;
  prompt: string;
  context: string;
  model: string;
  budgetCents: number;
  timeoutMs: number;
};

export interface ExecutionBackend {
  readonly id: string;
  provision(spec: TaskSpec): Promise<{ workspaceId: string }>;
  stream(workspaceId: string): AsyncIterable<RunEvent>;
  cancel(workspaceId: string): Promise<void>;
  cleanup(workspaceId: string): Promise<void>;
}

export interface AgentProvider {
  readonly id: "anthropic" | "openai";
  readonly name: string;
  readonly defaultModel: string;
  validateCredentials(secret: string): Promise<ValidationResult>;
  createSession(): Promise<{ ok: true } | ExecutionUnavailable>;
  executeTask(spec: TaskSpec): Promise<{ ok: true; workspaceId: string } | ExecutionUnavailable>;
  streamEvents(workspaceId: string): AsyncIterable<RunEvent>;
  requestApproval(runId: string, summary: string): Promise<void>;
  cancelExecution(workspaceId: string): Promise<void>;
  getExecutionStatus(workspaceId: string): Promise<{ status: string }>;
}
