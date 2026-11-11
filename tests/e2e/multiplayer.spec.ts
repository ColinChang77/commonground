import { expect, test, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { signUp } from "./helpers";

// Requires: `npm run dev` (:3100) AND the realtime worker (`npx wrangler dev --config realtime/wrangler.jsonc --port 8790`).
const r = Date.now().toString(36);
const ALEX = { name: "Alex Rivera", email: `alex-${r}@example.test`, username: `alex_${r}` };
const MAYA = { name: "Maya Chen", email: `maya-${r}@example.test`, username: `maya_${r}` };
const RYAN = { name: "Ryan Brooks", email: `ryan-${r}@example.test`, username: `ryan_${r}` };
const TITLE = `Swap night app ${r}`;

async function createProject(p: Page) {
  await p.goto("/create?type=project");
  await p.getByLabel("Project name").fill(TITLE);
  await p.getByLabel("One-line summary").fill("A tiny site for our neighborhood clothes swap nights.");
  await p.getByRole("radio", { name: "Community", exact: true }).click();
  await p.getByRole("switch", { name: "Software project" }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByLabel("Goals").fill("Launch the swap night sign-up page");
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Create project" }).click();
  await expect(p).toHaveURL(/\/p\//);
  return new URL(p.url()).pathname;
}

test("live presence, shared to-dos and shared AI agent activity across three signed-in people", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const [ca, cm, cr] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const alex = await ca.newPage(), maya = await cm.newPage(), ryan = await cr.newPage();
  await signUp(alex, ALEX.name, ALEX.email, ALEX.username);
  await signUp(maya, MAYA.name, MAYA.email, MAYA.username);
  await signUp(ryan, RYAN.name, RYAN.email, RYAN.username);

  // Alex starts a project and adds a to-do
  const path = await createProject(alex);
  await alex.goto(`${path}/tasks`);
  await alex.getByRole("button", { name: "New task" }).click();
  await alex.locator("#t-title").fill("Build the signup page");
  await alex.getByRole("button", { name: "Create task" }).click();
  await expect(alex.getByRole("link", { name: /Build the signup page/ })).toBeVisible();

  // P0.1 presence: all three open the project home
  await Promise.all([alex.goto(path), maya.goto(path), ryan.goto(path)]);
  const here = (p: Page) => p.locator("section[aria-labelledby=here-h]");
  for (const p of [alex, maya, ryan]) {
    await expect(here(p).getByText("Alex Rivera").or(here(p).getByText("You")).first()).toBeVisible();
    await expect(here(p).locator("li")).toHaveCount(3);
  }
  await expect(here(alex).getByText("Maya Chen")).toBeVisible();
  await expect(here(alex).getByText("Ryan Brooks")).toBeVisible();

  // Focus: Maya opens the shared work → others see what she's doing
  await maya.getByRole("link", { name: "Shared work" }).click();
  await expect(here(alex).locator("li", { hasText: "Maya Chen" })).toContainText("Looking at the shared work");

  // Shared to-do sync: Ryan takes the to-do from the home page; Alex sees it live without reloading
  await ryan.locator("section[aria-labelledby=help-h] li", { hasText: "Build the signup page" }).getByRole("button", { name: "I'll do this" }).click();
  await expect(ryan).toHaveURL(/\/tasks\//);
  await expect(alex.locator("section[aria-labelledby=happening-h]")).toContainText("Ryan Brooks joined the team");
  await expect(alex.locator("section[aria-labelledby=happening-h]")).toContainText("Ryan Brooks is working on “Build the signup page”");
  await expect(maya.locator("section[aria-label='In progress']")).toContainText("Build the signup page");

  // Leaving updates presence for everyone
  await maya.close();
  await expect(here(alex).locator("li")).toHaveCount(2);

  // P0.2 shared AI agent activity: Ryan connects his agent via MCP; Alex watches the Build page
  await ryan.goto("/settings/agents");
  await ryan.getByLabel("Name").fill("Ryan's Claude Code");
  await ryan.getByRole("button", { name: "Create token" }).click();
  const token = (await ryan.getByLabel("token", { exact: true }).textContent())!.trim();
  await alex.goto(`${path}/build`);
  const agent = new Client({ name: "ryan-agent", version: "1.0.0" });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await agent.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[])[0].text;
    if (res.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
  const projects = (await call("list_projects", {})) as { id: string; title: string }[];
  const pid = projects.find((p) => p.title === TITLE)!.id;
  const todo = ((await call("list_tasks", { project_id: pid, mine: true })) as { id: string }[])[0];
  const started = await call("start_work", { task_id: todo.id, agent_label: "Claude Code" });
  await expect(alex.getByText("Ryan's AI agent")).toBeVisible();
  await expect(alex.getByText(/is building/)).toBeVisible();
  await call("report_progress", { run_id: started.run_id, stage: "testing", message: "Running the test suite", tests_passed: 12, tests_failed: 0 });
  await expect(alex.getByText("12 tests passing")).toBeVisible();
  await call("report_progress", { run_id: started.run_id, stage: "changes_ready", message: "Signup page with email validation is ready", files_changed: ["app/signup/page.tsx", "app/signup/actions.ts"] });
  await expect(alex.getByText("Signup page with email validation is ready").first()).toBeVisible();
  await call("submit_contribution", { task_id: todo.id, run_id: started.run_id, summary: "Built the signup page with validation and tests.", link: "https://example.com/preview", authorship: "agent_generated", agent_label: "Claude Code" });
  await agent.close();

  // Team review: Ryan approves his agent's work → Alex sees it ready and verifies it
  await ryan.goto(`${path}/build`);
  await ryan.getByRole("button", { name: "Looks good — send to the team" }).click();
  await expect(alex.locator("section[aria-labelledby=ai-h]")).toContainText(/finished|waiting for review|Team review/);
  await alex.goto(`${path}/tasks`);
  await alex.getByRole("link", { name: /Build the signup page/ }).click();
  await alex.getByRole("button", { name: "Approve & verify" }).click();
  await expect(alex.getByText("Verified", { exact: true })).toBeVisible();
  await alex.goto(path);
  await expect(alex.getByText("1 of 1 things done")).toBeVisible();
  await Promise.all([ca.close(), cr.close()]);
});
