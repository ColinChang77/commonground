import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { d1, signUp } from "./helpers";

const run = Date.now().toString(36);
const A = { name: "Ana Owner", email: `ana-${run}@example.test`, username: `ana_${run}` };
const B = { name: "Ben Helper", email: `ben-${run}@example.test`, username: `ben_${run}` };
const IDEA = `Neighborhood tool library ${run}`;

test("idea → discussion → project → application → task → verified contribution → MCP agent context", async ({ browser, baseURL }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // 1. Sign up (email verification via the dev outbox) + onboarding
  await signUp(a, A.name, A.email, A.username);
  await signUp(b, B.name, B.email, B.username);

  // 2. A shares an idea
  await a.goto("/create");
  await a.getByLabel("Title").fill(IDEA);
  await a.locator("#body").fill("Let's lend **drills and ladders** instead of everyone buying them.");
  await a.getByRole("radio", { name: "Community" }).click();
  await a.getByRole("button", { name: "Post" }).click();
  await expect(a.getByRole("heading", { name: IDEA })).toBeVisible();
  const discussionUrl = a.url();

  // 3. B finds it in the feed and comments
  await b.goto("/?tab=latest");
  await b.getByRole("link", { name: IDEA }).click();
  await b.getByLabel("Add to the conversation…").fill("I have a garage we could use as the first shelf!");
  await b.getByRole("button", { name: "Comment" }).click();
  await expect(b.getByText("I have a garage")).toBeVisible();

  // 4. A turns the discussion into a project (explicit confirmation required)
  await a.goto(discussionUrl);
  await a.getByRole("link", { name: "Turn into Project" }).click();
  await expect(a.getByLabel("Project name")).toHaveValue(IDEA);
  await a.getByLabel("One-line summary").fill("A shared tool library run by neighbors, for neighbors.");
  await a.getByRole("button", { name: "Continue" }).click();
  await a.getByLabel("Goals").fill("Lend 100 tools in three months");
  await a.getByRole("button", { name: "Continue" }).click();
  await a.getByRole("button", { name: "Add a role" }).click();
  await a.getByLabel("Role 1 title").fill("Poster illustrator");
  await a.getByRole("button", { name: "Continue" }).click();
  const create = a.getByRole("button", { name: "Create project" });
  await expect(create).toBeDisabled();
  await a.getByRole("checkbox").check();
  await create.click();
  await expect(a).toHaveURL(/\/p\//);
  const projectPath = new URL(a.url()).pathname;
  await expect(a.getByRole("heading", { level: 1, name: IDEA })).toBeVisible();

  // Original discussion stays and links to the project
  await a.goto(discussionUrl);
  await expect(a.getByText("This discussion became a project")).toBeVisible();
  await expect(a.getByText("I have a garage")).toBeVisible();

  // 5. B was notified and applies
  await b.goto("/activity");
  await expect(b.getByText(`“${IDEA}” is now a project`)).toBeVisible();
  await b.goto(`${projectPath}/opportunities`);
  await b.getByRole("button", { name: "Apply" }).click();
  await b.getByLabel("Application message").fill("I draw posters for our community garden every spring — happy to help!");
  await b.getByRole("button", { name: "Send application" }).click();
  await expect(b.getByText("Application pending")).toBeVisible();

  // 6. A accepts
  await a.goto(`${projectPath}/opportunities`);
  await expect(a.getByText("I draw posters")).toBeVisible();
  await a.getByRole("button", { name: "Accept" }).click();
  await expect(a.getByText(/accepted/)).toBeVisible();

  // 7. A assigns a task to B
  await a.goto(`${projectPath}/tasks`);
  await a.getByRole("button", { name: "New task" }).click();
  await a.locator("#t-title").fill("Design the launch poster");
  await a.locator("#t-assignee").click();
  await a.getByRole("option", { name: B.name }).click();
  await a.getByRole("button", { name: "Create task" }).click();
  await expect(a.getByRole("link", { name: /Design the launch poster/ })).toBeVisible();

  // 8. B submits work
  await b.goto(`${projectPath}/tasks`);
  await b.getByRole("link", { name: /Design the launch poster/ }).last().click();
  await b.getByLabel("What did you do?").fill("Poster is done — A2, print-ready, with the library's opening hours.");
  await b.getByLabel("Link to the deliverable").fill("https://example.com/poster.pdf");
  await b.getByRole("button", { name: "Submit for review" }).click();
  await expect(b.getByText("Awaiting review")).toBeVisible();

  // 9. A verifies → contribution recorded
  await a.goto(a.url());
  await a.goto(`${projectPath}/tasks`);
  await a.getByRole("link", { name: /Design the launch poster/ }).last().click();
  await a.getByRole("button", { name: "Approve & verify" }).click();
  await expect(a.getByText("Verified", { exact: true })).toBeVisible();

  // 10. Verified contribution is on B's profile and the project's Contributors tab
  await b.goto(`/u/${B.username}`);
  await expect(b.getByText("1 verified across 1 project.")).toBeVisible();
  await expect(b.getByText("Design the launch poster")).toBeVisible();
  await b.goto("/activity");
  await expect(b.getByText(/was verified/)).toBeVisible();

  // 11. A connects an external agent over MCP
  await a.goto("/settings/agents");
  await a.getByLabel("Name").fill("Playwright agent");
  await a.getByRole("button", { name: "Create token" }).click();
  const token = (await a.getByLabel("token", { exact: true }).textContent())!.trim();
  expect(token).toMatch(/^cg_mcp_/);
  const client = new Client({ name: "e2e-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const list = await client.callTool({ name: "list_projects", arguments: {} });
  const projects = JSON.parse((list.content as { text: string }[])[0].text) as { id: string; title: string }[];
  const mine = projects.find((p) => p.title === IDEA);
  expect(mine).toBeTruthy();
  const ctx = await client.callTool({ name: "get_project_context", arguments: { project_id: mine!.id } });
  expect((ctx.content as { text: string }[])[0].text).toContain("Lend 100 tools");
  await client.close();
  await a.getByRole("button", { name: "Done" }).click();
  await a.reload();
  await expect(a.getByText(/Connected — last used/)).toBeVisible();

  // Bad token is rejected
  const bad = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { Authorization: "Bearer cg_mcp_invalidinvalidinvalidinvalid", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  expect(bad.status).toBe(401);

  // Build workspace shows the agent's real activity
  await a.goto(`${projectPath}/settings`);
  await a.getByLabel("Software project").click();
  await a.getByRole("button", { name: "Save changes" }).click();
  await a.goto(`${projectPath}/build`);
  await expect(a.getByRole("heading", { name: "What do you want built?" })).toBeVisible();
  await a.getByText("Advanced: GitHub, AI coding tools").click();
  await expect(a.getByText("Loaded project context")).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

test("logged-out visitors can read public content but must sign in to act", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Join CommonGround" })).toBeVisible();
  await page.goto("/create");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcreate/);
  await page.goto("/sign-in?next=//evil.example");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("mobile layouts have no horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const path of ["/", "/?tab=projects", "/collaborate", "/search?q=tool", "/sign-up", "/legal/terms", "/p/swap-night", "/p/block-tool-library/build", "/demo", "/c/community"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" }).last()).toBeVisible();
  await ctx.close();
});

test("Reddit-style voting, communities and getting-started checklist", async ({ page }) => {
  const r = Date.now().toString(36);
  await signUp(page, "Vera Voter", `vera-${r}@example.test`, `vera_${r}`);
  // Joined c/Community during onboarding → checklist step 1 is done
  await expect(page.locator("h2:visible", { hasText: "Getting started" })).toBeVisible();
  await page.goto("/create");
  await page.getByLabel("Title").fill(`Vote test ${r}`);
  await page.getByRole("radio", { name: "Art", exact: true }).click();
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByRole("heading", { name: `Vote test ${r}` })).toBeVisible();
  // Author's own upvote is counted (Reddit-style); clicking ▲ again removes it, ▼ makes it -1
  const score = page.getByLabel(/^Score /).first();
  await expect(score).toHaveText("1");
  const removed = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/d/"));
  await page.getByRole("button", { name: "Upvote" }).first().click();
  await expect(score).toHaveText("0");
  await removed;
  const saved = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/d/"));
  await page.getByRole("button", { name: "Downvote" }).first().click();
  await expect(score).toHaveText("-1");
  await saved;
  await page.reload();
  await expect(page.getByLabel(/^Score /).first()).toHaveText("-1");
  // Community page lists the post and can be joined
  await page.goto("/c/art?sort=new");
  await expect(page.getByRole("link", { name: `Vote test ${r}` })).toBeVisible();
  await page.getByRole("button", { name: "Join", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Joined" }).first()).toBeVisible();
});

test("Website & app: plain-language request → team builds → requester approves", async ({ browser }) => {
  const r = Date.now().toString(36);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const username = `owen_${r}`;
  await signUp(page, "Owen Owner", `owen-${r}@example.test`, username);
  // Owner creates a simple project from scratch
  await page.goto("/create?type=project");
  await page.getByLabel("Project name").fill(`Bake sale ${r}`);
  await page.getByLabel("One-line summary").fill("A monthly bake sale that funds the school library.");
  await page.getByRole("radio", { name: "Community", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Goals").fill("Raise money for books");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/p\//);
  const projectPath = new URL(page.url()).pathname;

  // Non-technical request: pick a template, choose "team"
  await page.goto(`${projectPath}/build`);
  await page.getByRole("radio", { name: /Sign-up form/ }).click();
  await page.getByText("The CommonGround team builds it").click();
  await page.getByRole("button", { name: "Send request →" }).click();
  await expect(page.getByText("Our team got your request")).toBeVisible();

  // Staff member moves it along (make this user staff in the local test DB)
  d1(`UPDATE profiles SET platform_role = 'admin' WHERE username = '${username}'`);
  await page.goto("/admin#builds");
  const card = page.locator("li", { hasText: `Bake sale ${r}` }).first();
  await card.getByRole("button", { name: "Start building" }).click();
  await expect(card.getByLabel("Preview or live link")).toBeVisible();
  await card.getByLabel("Preview or live link").fill("https://example.com/preview");
  await card.getByRole("button", { name: "Send for review" }).click();
  await expect(page.locator("li", { hasText: `Bake sale ${r}` }).first().getByRole("button", { name: "Mark live" })).toBeVisible();

  // Requester sees "Your review" and approves
  await page.goto(`${projectPath}/build`);
  await expect(page.getByText("It's ready — take a look")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open preview" })).toHaveAttribute("href", "https://example.com/preview");
  await page.getByRole("button", { name: "Looks good — approve" }).click();
  await expect(page.getByText("It's live!")).toBeVisible();
  await ctx.close();
});
