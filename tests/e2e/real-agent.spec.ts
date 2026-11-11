import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { signUp } from "./helpers";

// Real agent execution: runs the local Claude Code CLI headless as Ryan's agent against CommonGround's MCP server.
// Opt-in (uses Claude Code quota): REAL_AGENT=1 npx playwright test tests/e2e/real-agent.spec.ts
test.skip(!process.env.REAL_AGENT, "set REAL_AGENT=1 to run a real Claude Code session");

test("a real Claude Code agent works on a shared to-do while a teammate watches live", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const r = Date.now().toString(36);
  const title = `Real agent demo ${r}`;
  const [ca, cr] = await Promise.all([browser.newContext(), browser.newContext()]);
  const alex = await ca.newPage(), ryan = await cr.newPage();
  await signUp(alex, "Alex Rivera", `alex-ra-${r}@example.test`, `alexra_${r}`);
  await signUp(ryan, "Ryan Brooks", `ryan-ra-${r}@example.test`, `ryanra_${r}`);

  await alex.goto("/create?type=project");
  await alex.getByLabel("Project name").fill(title);
  await alex.getByLabel("One-line summary").fill("Testing a real AI agent working with the team.");
  await alex.getByRole("radio", { name: "Technology", exact: true }).click();
  await alex.getByRole("switch", { name: "Software project" }).click();
  await alex.getByRole("button", { name: "Continue" }).click();
  await alex.getByLabel("Goals").fill("Ship a slugify helper");
  await alex.getByRole("button", { name: "Continue" }).click();
  await alex.getByRole("button", { name: "Continue" }).click();
  await alex.getByRole("button", { name: "Create project" }).click();
  await expect(alex).toHaveURL(/\/p\//);
  const projectPath = new URL(alex.url()).pathname;
  await alex.goto(`${projectPath}/tasks`);
  await alex.getByRole("button", { name: "New task" }).click();
  await alex.locator("#t-title").fill("Write a slugify helper");
  await alex.getByRole("button", { name: "Create task" }).click();
  await expect(alex.getByRole("link", { name: /Write a slugify helper/ })).toBeVisible();

  // Ryan joins by taking the to-do, then creates an MCP key for his agent
  await ryan.goto(projectPath);
  await ryan.locator("section[aria-labelledby=help-h] li", { hasText: "Write a slugify helper" }).getByRole("button", { name: "I'll do this" }).click();
  await expect(ryan).toHaveURL(/\/tasks\//);
  await ryan.goto("/settings/agents");
  await ryan.getByLabel("Name").fill("Ryan's Claude Code");
  await ryan.getByRole("button", { name: "Create token" }).click();
  const token = (await ryan.getByLabel("token", { exact: true }).textContent())!.trim();

  await alex.goto(`${projectPath}/build`);

  const work = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "cg-agent-"));
  writeFileSync(path.join(work, "mcp.json"), JSON.stringify({ mcpServers: { commonground: { type: "http", url: `${baseURL}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } }));
  const prompt = [
    `You are Ryan's coding agent for the CommonGround project titled "${title}", reachable through the "commonground" MCP server. Follow these steps exactly and do nothing else:`,
    `1. Call list_projects and find the project titled "${title}". 2. Call list_tasks with mine=true and pick the task "Write a slugify helper".`,
    `3. Call start_work for it with agent_label "Claude Code". Keep the returned run_id.`,
    `4. Call report_progress (stage "working") saying you're writing the helper.`,
    `5. In the current directory create slugify.mjs exporting function slugify(s) that lowercases, replaces runs of non-alphanumeric characters with "-", and trims leading/trailing "-". Create slugify.test.mjs using node:test and node:assert with exactly 3 test cases.`,
    `6. Run: node --test slugify.test.mjs`,
    `7. Call report_progress with stage "testing", a short message, and tests_passed / tests_failed copied from the real output.`,
    `8. Call report_progress with stage "changes_ready", message "slugify helper ready", files_changed ["slugify.mjs","slugify.test.mjs"].`,
    `9. Call submit_contribution with the task_id, run_id, a one-sentence summary, authorship "agent_generated", agent_label "Claude Code".`,
  ].join("\n");
  const child = spawn("claude", ["-p", prompt, "--strict-mcp-config", "--mcp-config", path.join(work, "mcp.json"), "--allowedTools", "mcp__commonground__*", "Write", "Read", "Bash(node --test:*)", "--output-format", "text"], { cwd: work, env: process.env });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const exited = new Promise<number>((res) => child.on("close", (code) => res(code ?? -1)));

  // Alex sees the real agent's progress live, without reloading
  await expect(alex.getByText("Ryan's AI agent")).toBeVisible({ timeout: 240_000 });
  await expect(alex.getByText(/tests passing/)).toBeVisible({ timeout: 240_000 });
  const code = await Promise.race([exited, new Promise<number>((res) => setTimeout(() => { child.kill(); res(-2); }, 300_000))]);
  console.log(`--- claude exit=${code}\n${out.slice(-1500)}`);
  expect(existsSync(path.join(work, "slugify.mjs"))).toBe(true);
  console.log("slugify.mjs:\n" + readFileSync(path.join(work, "slugify.mjs"), "utf8"));
  await expect(alex.getByText("This agent's work is waiting for a review.")).toBeVisible({ timeout: 60_000 });
  await alex.screenshot({ path: path.join(process.env.TMPDIR ?? tmpdir(), "real-agent-alex-view.png"), fullPage: true });
  await Promise.all([ca.close(), cr.close()]);
});
