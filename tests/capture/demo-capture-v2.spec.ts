/**
 * v2 footage for the revised demo (opt-in: CAPTURE2=1). Three real accounts — Alex, Maya, Ryan — one project.
 * The page is rendered at 1.35× zoom inside a native 1920×1080 viewport so UI text is large and crisp on video.
 */
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, renameSync } from "node:fs";
import path from "node:path";
import { signUp, d1 } from "../e2e/helpers";

test.skip(!process.env.CAPTURE2, "set CAPTURE2=1");
const OUT = path.resolve(process.env.HOME!, "Desktop/commonground-video/capture2");
const SITE = path.join(OUT, "agent-site");
const ZOOM = 1.35;
const r = Date.now().toString(36).slice(-4);
const people = {
  alex: { name: "Alex Kim", email: `alex.v2.${r}@example.test`, username: `alexkim_${r}` },
  maya: { name: "Maya Patel", email: `maya.v2.${r}@example.test`, username: `mayapatel_${r}` },
  ryan: { name: "Ryan Brooks", email: `ryan.v2.${r}@example.test`, username: `ryanbrooks_${r}` },
};
type Who = keyof typeof people;
const beats: Record<string, { who: Who; t: number }> = {};
const starts: Record<string, number> = {};

const INIT = `
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.zoom = '${ZOOM}';
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);transition:transform 40ms linear';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.4-7.6L20.5 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    // clientX is in unzoomed viewport px; the overlay lives inside the zoomed root, so divide.
    window.addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX / ${ZOOM} - 3) + 'px,' + (e.clientY / ${ZOOM} - 2) + 'px)'; }, true);
  });`;

async function recorded(browser: Browser, who: Who): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: path.join(OUT, "raw", who), size: { width: 1920, height: 1080 } } });
  starts[who] = Date.now();
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(people[who].email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  return { ctx, page };
}
const beat = (name: string, who: Who) => { beats[name] = { who, t: (Date.now() - starts[who]) / 1000 }; };
async function moveTo(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 });
  return b;
}
async function moveClick(page: Page, loc: Locator, hold = 350) { await moveTo(page, loc); await page.waitForTimeout(hold); await loc.click(); }
async function typeIn(loc: Locator, text: string, delay = 45) { await loc.click(); await loc.pressSequentially(text, { delay }); }
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, "shots", `${name}.png`) });

test("capture v2: Alex, Maya and Ryan build Campus Skill Exchange", async ({ browser, baseURL }) => {
  test.setTimeout(900_000);
  mkdirSync(path.join(OUT, "shots"), { recursive: true });
  mkdirSync(SITE, { recursive: true });
  const setup = await browser.newContext();
  for (const w of Object.keys(people) as Who[]) { const p = await setup.newPage(); await signUp(p, people[w].name, people[w].email, people[w].username); await p.close(); await setup.clearCookies(); }
  await setup.close();

  const A = await recorded(browser, "alex"), M = await recorded(browser, "maya"), R = await recorded(browser, "ryan");
  const alex = A.page, maya = M.page, ryan = R.page;

  // Scene 3 — Alex shares the idea
  await alex.goto("/create");
  await alex.waitForTimeout(1500);
  beat("createOpen", "alex");
  await moveClick(alex, alex.getByRole("radio", { name: /^Idea/ }));
  beat("titleStart", "alex");
  await typeIn(alex.getByLabel("Title"), "What if students could exchange skills instead of paying for lessons?", 55);
  beat("titleDone", "alex");
  await typeIn(alex.locator("#body"), "I can teach guitar and Python, and I want to learn design. Let's build a campus platform where students trade skills.", 14);
  await moveClick(alex, alex.getByRole("radio", { name: "Education", exact: true }));
  await moveTo(alex, alex.getByRole("button", { name: "Post" }));
  beat("hoverPost", "alex");
  await alex.waitForTimeout(1500);
  await alex.getByRole("button", { name: "Post" }).click();
  await expect(alex.getByRole("heading", { name: /exchange skills/ })).toBeVisible();
  beat("posted", "alex");
  await alex.mouse.move(1700, 900, { steps: 10 });
  await alex.waitForTimeout(4000);
  const postUrl = alex.url();
  await shot(alex, "post");

  // Scene 4 — collaborators arrive (Alex scrolls to the conversation first)
  await maya.goto(postUrl); await ryan.goto(postUrl);
  await alex.locator("#comments").scrollIntoViewIfNeeded();
  await alex.waitForTimeout(2500);
  beat("convo", "alex");
  await typeIn(maya.getByLabel("Add to the conversation…"), "I can help with the design.", 40);
  await moveClick(maya, maya.getByRole("button", { name: "Comment" }));
  await expect(alex.getByText("I can help with the design.")).toBeVisible({ timeout: 15000 });
  beat("mayaLanded", "alex");
  await alex.waitForTimeout(4500);
  await typeIn(ryan.getByLabel("Add to the conversation…"), "I can build the first version.", 40);
  await moveClick(ryan, ryan.getByRole("button", { name: "Comment" }));
  await expect(alex.getByText("I can build the first version.")).toBeVisible({ timeout: 15000 });
  beat("ryanLanded", "alex");
  await alex.waitForTimeout(4500);
  await shot(alex, "comments");

  // Scene 5 — turn into project
  await alex.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await alex.waitForTimeout(1200);
  const turn = alex.getByRole("link", { name: "Turn into Project" });
  await moveTo(alex, turn);
  beat("hoverTurn", "alex");
  await alex.waitForTimeout(1200);
  await turn.click();
  await alex.waitForURL(/convert/);
  beat("wizard", "alex");
  const nameBox = alex.getByLabel("Project name");
  await nameBox.fill("Campus Skill Exchange");
  await alex.getByLabel("One-line summary").fill("Students trade skills with each other instead of paying for lessons.");
  await alex.getByRole("switch", { name: "Software project" }).click();
  await alex.getByRole("button", { name: "Continue" }).click();
  await alex.getByLabel("Goals").fill("Launch a working prototype where students exchange skills");
  await alex.getByRole("button", { name: "Continue" }).click();
  await alex.getByRole("button", { name: "Continue" }).click();
  await alex.getByRole("checkbox").check();
  await moveClick(alex, alex.getByRole("button", { name: "Create project" }));
  await alex.waitForURL(/\/p\//);
  beat("projectCreated", "alex");
  const projectPath = new URL(alex.url()).pathname;
  await alex.waitForTimeout(3000);
  // three to-dos (not featured in the edit)
  await alex.goto(`${projectPath}/tasks`);
  for (const title of ["Product requirements", "Interface design", "Build the first version"]) {
    await alex.getByRole("button", { name: "New task" }).click();
    await alex.locator("#t-title").fill(title);
    await alex.getByRole("button", { name: "Create task" }).click();
    await expect(alex.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  }
  d1(`UPDATE tasks SET contribution_type = CASE title WHEN 'Product requirements' THEN 'research' WHEN 'Interface design' THEN 'design' ELSE 'code' END, is_coding = CASE title WHEN 'Build the first version' THEN 1 ELSE 0 END WHERE project_id = (SELECT id FROM projects WHERE slug = '${projectPath.split("/").pop()}')`);
  // everyone on the project home; each person picks their task — Alex watches live
  await alex.goto(projectPath); await maya.goto(projectPath); await ryan.goto(projectPath);
  await alex.waitForTimeout(3000);
  beat("homeReady", "alex");
  const take = async (p: Page, title: string, key: string) => {
    await moveClick(p, p.locator("section[aria-labelledby=help-h] li", { hasText: title }).getByRole("button", { name: "I'll do this" }), 500);
    await expect(alex.locator("section[aria-labelledby=happening-h]")).toContainText(`working on “${title}”`, { timeout: 15000 });
    beat(key, "alex");
    await alex.waitForTimeout(2500);
  };
  await take(alex, "Product requirements", "alexTook");
  await alex.goto(projectPath); await alex.waitForTimeout(1500);
  beat("homeAgain", "alex");
  await take(maya, "Interface design", "mayaTook");
  await take(ryan, "Build the first version", "ryanTook");
  await alex.waitForTimeout(2000);
  await shot(alex, "home-team");

  // Scene 6 — Ryan's real Claude Code agent; Alex watches
  await ryan.goto("/settings/agents");
  await ryan.getByLabel("Name").fill("Ryan's Claude Code");
  await ryan.getByRole("button", { name: "Create token" }).click();
  const token = (await ryan.getByLabel("token", { exact: true }).textContent())!.trim();
  await ryan.getByRole("button", { name: "Done" }).click();
  await alex.goto(`${projectPath}/build`);
  await alex.waitForTimeout(2000);
  beat("buildPage", "alex");
  const mcpFile = path.join(OUT, "mcp.json");
  writeFileSync(mcpFile, JSON.stringify({ mcpServers: { commonground: { type: "http", url: `${baseURL}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } }));
  const prompt = [
    `You are Ryan's coding agent for the CommonGround project "Campus Skill Exchange" (MCP server "commonground"). Do exactly these steps:`,
    `1. list_projects → "Campus Skill Exchange". 2. list_tasks mine=true → "Build the first version". 3. start_work with agent_label "Claude Code" (keep run_id).`,
    `4. report_progress stage "working", message "Building the first version of the site".`,
    `5. Create index.html in the current directory: a polished single page (inline CSS, no external assets) titled "Campus Skill Exchange": hero "Trade skills, not tuition" with a short subtitle; "How it works" (Offer · Match · Learn); "Students" with 3 cards (class "profile"): Alex — teaches Guitar & Python, wants Design; Maya — teaches UI design, wants Spanish; Ryan — teaches Web development, wants Guitar; "Open exchanges" with 4 listings (class "listing") showing offer ⇄ want. Warm off-white background, green accent #2f7a4f, rounded cards, system-ui font, generous spacing. Section ids: hero, how, profiles, listings.`,
    `6. Create site.test.mjs (node:test + node:assert) checking the title, the 4 section ids, 3 .profile cards and 4 .listing items.`,
    `7. Run: node --test site.test.mjs`,
    `8. report_progress stage "testing" with tests_passed / tests_failed from the real output.`,
    `9. report_progress stage "changes_ready", message "The first version is ready for review", files_changed ["index.html","site.test.mjs"].`,
    `10. submit_contribution with task_id, run_id, a one-sentence summary, authorship "agent_generated", agent_label "Claude Code".`,
  ].join("\n");
  const child = spawn("claude", ["-p", prompt, "--strict-mcp-config", "--mcp-config", mcpFile, "--allowedTools", "mcp__commonground__*", "Write", "Read", "Edit", "Bash(node --test:*)"], { cwd: SITE, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let agentOut = "";
  child.stdout.on("data", (d) => (agentOut += d)); child.stderr.on("data", (d) => (agentOut += d));
  const exited = new Promise<number>((res) => child.on("close", (c) => res(c ?? -1)));
  await expect(alex.getByText("Ryan's AI agent")).toBeVisible({ timeout: 240_000 });
  beat("agentStarted", "alex");
  await expect(alex.getByText(/tests passing/)).toBeVisible({ timeout: 300_000 });
  beat("agentTests", "alex");
  await expect(alex.getByText("This agent's work is waiting for a review.")).toBeVisible({ timeout: 300_000 });
  beat("agentReady", "alex");
  await alex.waitForTimeout(3000);
  await shot(alex, "agent-ready");
  const code = await Promise.race([exited, new Promise<number>((res) => setTimeout(() => { child.kill(); res(-2); }, 300_000))]);
  writeFileSync(path.join(OUT, "agent-output.txt"), `exit=${code}\n${agentOut}`);

  // Ryan sends it to the team; Alex reviews and approves
  await ryan.goto(`${projectPath}/build`);
  await moveClick(ryan, ryan.getByRole("button", { name: "Looks good — send to the team" }));
  await alex.waitForTimeout(2500);
  await alex.goto(`${projectPath}/tasks`);
  await alex.getByRole("link", { name: /Build the first version/ }).last().click();
  await alex.waitForTimeout(2500);
  beat("reviewOpen", "alex");
  const approve = alex.getByRole("button", { name: "Approve & verify" });
  await moveTo(alex, approve);
  await alex.waitForTimeout(1500);
  beat("hoverApprove", "alex");
  await approve.click();
  await expect(alex.getByText("Verified", { exact: true })).toBeVisible();
  beat("approved", "alex");
  await alex.waitForTimeout(4000);
  await shot(alex, "approved");

  // Off-camera bookkeeping so the outcome is complete: Maya's design and Alex's requirements get verified
  await maya.goto(`${projectPath}/tasks`);
  await maya.getByRole("link", { name: /Interface design/ }).last().click();
  await maya.getByLabel("What did you do?").fill("Mobile-first screens: home, profiles and the exchange board.");
  await maya.getByRole("button", { name: "Submit for review" }).click();
  await expect(maya.getByText("Awaiting review")).toBeVisible();
  await alex.goto(`${projectPath}/tasks`);
  await alex.getByRole("link", { name: /Interface design/ }).last().click();
  await alex.getByRole("button", { name: "Approve & verify" }).click();
  await expect(alex.getByText("Verified", { exact: true })).toBeVisible();
  await alex.goto(`${projectPath}/tasks`);
  await alex.getByRole("link", { name: /Product requirements/ }).last().click();
  await alex.getByLabel("What did you do?").fill("One-page product brief: who it's for, the core exchange flow, and what v1 includes.");
  await alex.getByRole("button", { name: "Submit for review" }).click();
  d1(`UPDATE project_members SET role = 'admin' WHERE user_id = (SELECT user_id FROM profiles WHERE username = '${people.maya.username}')`);
  await maya.goto(`${projectPath}/tasks`);
  await maya.getByRole("link", { name: /Product requirements/ }).last().click();
  await maya.getByRole("button", { name: "Approve & verify" }).click();
  await expect(maya.getByText("Verified", { exact: true })).toBeVisible();
  await alex.goto(`${projectPath}/settings`);
  await alex.locator("#s-status").click();
  await alex.getByRole("option", { name: "Completed" }).click();
  await alex.getByRole("button", { name: "Save changes" }).click();
  await alex.waitForTimeout(1000);
  await alex.goto(`${projectPath}/contributors`);
  await alex.waitForTimeout(2000);
  await shot(alex, "team");

  // Scene 7 — the prototype (crisp, larger rendering)
  const siteCtx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, recordVideo: { dir: path.join(OUT, "raw", "site"), size: { width: 1920, height: 1080 } } });
  const site = await siteCtx.newPage();
  const siteStart = Date.now();
  await site.goto(`file://${path.join(SITE, "index.html")}`);
  await site.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { await site.mouse.wheel(0, 260); await site.waitForTimeout(700); }
  await site.waitForTimeout(2000);
  await site.screenshot({ path: path.join(OUT, "shots", "site-full.png"), fullPage: true });
  const siteVideo = site.video();
  await siteCtx.close();
  if (siteVideo) renameSync(await siteVideo.path(), path.join(OUT, "site.webm"));

  for (const [who, h] of Object.entries({ alex: A, maya: M, ryan: R })) {
    const v = h.page.video(); await h.ctx.close();
    if (v) renameSync(await v.path(), path.join(OUT, `${who}.webm`));
  }
  writeFileSync(path.join(OUT, "beats.json"), JSON.stringify({ beats, projectPath, postUrl, people, agentExit: code, siteSeconds: (Date.now() - siteStart) / 1000 }, null, 2));
  expect(existsSync(path.join(SITE, "index.html"))).toBe(true);
});
