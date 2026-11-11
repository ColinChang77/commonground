/**
 * Records real product footage for the YC demo video (opt-in: CAPTURE=1).
 * Four real accounts act out the story on the local app; a real Claude Code session builds the site.
 * Outputs webm recordings per person + beats.json (seconds from each recording's start) + screenshots.
 */
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { signUp, d1 } from "../e2e/helpers";

test.skip(!process.env.CAPTURE, "set CAPTURE=1");
const OUT = path.resolve(process.env.HOME!, "Desktop/commonground-video/capture");
const SITE = path.join(OUT, "agent-site");
const r = Date.now().toString(36).slice(-4);
const people = {
  alex: { name: "Alex Kim", email: `alex.kim.${r}@example.test`, username: `alexkim_${r}` },
  maya: { name: "Maya Patel", email: `maya.patel.${r}@example.test`, username: `mayapatel_${r}` },
  ryan: { name: "Ryan Brooks", email: `ryan.brooks.${r}@example.test`, username: `ryanb_${r}` },
  sam: { name: "Sam Okafor", email: `sam.okafor.${r}@example.test`, username: `samokafor_${r}` },
};
type Who = keyof typeof people;
const beats: Record<string, { who: Who; t: number }> = {};
const starts: Record<string, number> = {};
const PASSWORD = "correct-horse-battery";

const CURSOR = `
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform 40ms linear';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7.5 19 2.4-7.6L20.5 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    window.addEventListener('mousedown', () => { c.style.scale = '0.85'; }, true);
    window.addEventListener('mouseup', () => { c.style.scale = '1'; }, true);
  });`;

async function recorded(browser: Browser, who: Who): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, recordVideo: { dir: path.join(OUT, "raw", who), size: { width: 1920, height: 1080 } } });
  starts[who] = Date.now();
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(people[who].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  return { ctx, page };
}
const beat = (name: string, who: Who) => { beats[name] = { who, t: (Date.now() - starts[who]) / 1000 }; };
async function moveClick(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 });
  await page.waitForTimeout(180);
  await loc.click();
}
async function typeIn(loc: Locator, text: string, delay = 28) { await loc.click(); await loc.pressSequentially(text, { delay }); }
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, "shots", `${name}.png`) });

test("capture the CommonGround multiplayer story", async ({ browser, baseURL }) => {
  test.setTimeout(900_000);
  mkdirSync(path.join(OUT, "shots"), { recursive: true });
  mkdirSync(SITE, { recursive: true });

  // Accounts (not filmed)
  const setup = await browser.newContext();
  for (const w of Object.keys(people) as Who[]) {
    const p = await setup.newPage();
    // signUp uses its own password constant; keep in sync
    await signUp(p, people[w].name, people[w].email, people[w].username);
    await p.close();
    await setup.clearCookies();
  }
  await setup.close();
  d1(`UPDATE profiles SET bio = CASE username WHEN '${people.alex.username}' THEN 'CS student. Loves starting things.' WHEN '${people.maya.username}' THEN 'Product design student.' WHEN '${people.ryan.username}' THEN 'Builds things with code and AI.' ELSE 'Education researcher.' END WHERE username IN ('${people.alex.username}','${people.maya.username}','${people.ryan.username}','${people.sam.username}')`);

  const A = await recorded(browser, "alex");
  const M = await recorded(browser, "maya");
  const R = await recorded(browser, "ryan");
  const S = await recorded(browser, "sam");
  const alex = A.page, maya = M.page, ryan = R.page, sam = S.page;

  // ---- Scene 2: Alex shares the idea
  await alex.goto("/?sort=hot");
  await alex.waitForTimeout(1500);
  beat("feed", "alex");
  await moveClick(alex, alex.getByRole("link", { name: "Create" }).first());
  await alex.waitForURL(/\/create/);
  beat("create", "alex");
  await moveClick(alex, alex.getByRole("radio", { name: /Question \/ chat/ }));
  await typeIn(alex.getByLabel("Title"), "What if students could exchange skills instead of paying for lessons?");
  await typeIn(alex.locator("#body"), "I can teach guitar and Python. I want to learn design and Spanish. Bet a lot of students are in the same spot — what if there was a campus platform for trading skills? I can't build it alone.", 12);
  await moveClick(alex, alex.getByRole("radio", { name: "Education", exact: true }));
  beat("beforePost", "alex");
  await moveClick(alex, alex.getByRole("button", { name: "Post" }));
  await expect(alex.getByRole("heading", { name: /exchange skills/ })).toBeVisible();
  beat("posted", "alex");
  const postUrl = alex.url();
  await alex.waitForTimeout(1200);
  await shot(alex, "s2-post");

  // ---- Scene 3: Maya, Ryan, Sam join the conversation (Alex watches live)
  for (const p of [maya, ryan, sam]) await p.goto(postUrl);
  await alex.waitForTimeout(1500);
  beat("othersHere", "alex");
  const comment = async (p: Page, who: Who, text: string) => {
    beat(`${who}Typing`, who);
    await typeIn(p.getByLabel("Add to the conversation…"), text, 22);
    await moveClick(p, p.getByRole("button", { name: "Comment" }));
    await expect(alex.getByText(text)).toBeVisible({ timeout: 15000 });
    beat(`${who}Commented`, "alex");
    await alex.waitForTimeout(900);
  };
  await comment(maya, "maya", "I can help design the interface!");
  await moveClick(ryan, ryan.getByRole("button", { name: /I'd help/ }).first());
  await comment(ryan, "ryan", "I'd love to build the first version.");
  await comment(sam, "sam", "I can interview students to validate the idea.");
  await alex.waitForTimeout(1500);
  await shot(alex, "s3-comments");

  // ---- Scene 4: Turn into project
  beat("turnStart", "alex");
  await moveClick(alex, alex.getByRole("link", { name: "Turn into Project" }));
  await alex.waitForURL(/convert/);
  const nameBox = alex.getByLabel("Project name");
  await nameBox.fill("");
  await typeIn(nameBox, "Campus Skill Exchange", 35);
  await typeIn(alex.getByLabel("One-line summary"), "Students trade skills with each other instead of paying for lessons.", 14);
  await moveClick(alex, alex.getByRole("switch", { name: "Software project" }));
  await moveClick(alex, alex.getByRole("button", { name: "Continue" }));
  await typeIn(alex.getByLabel("Goals"), "Launch a working platform where students exchange skills", 18);
  await moveClick(alex, alex.getByRole("button", { name: "Continue" }));
  await moveClick(alex, alex.getByRole("button", { name: "Continue" }));
  await moveClick(alex, alex.getByRole("checkbox"));
  beat("beforeCreate", "alex");
  await moveClick(alex, alex.getByRole("button", { name: "Create project" }));
  await alex.waitForURL(/\/p\//);
  beat("projectCreated", "alex");
  const projectPath = new URL(alex.url()).pathname;
  await alex.waitForTimeout(1500);
  await shot(alex, "s4-project-new");

  // Alex adds three to-dos (filmed quickly)
  await alex.goto(`${projectPath}/tasks`);
  beat("tasksStart", "alex");
  for (const [title, type] of [["Design the user interface", "Design"], ["Build the application", "Code"], ["Interview potential users", "Research"]]) {
    await moveClick(alex, alex.getByRole("button", { name: "New task" }));
    await typeIn(alex.locator("#t-title"), title, 20);
    await alex.locator("#t-type").click();
    await alex.getByRole("option", { name: type, exact: true }).click();
    await moveClick(alex, alex.getByRole("button", { name: "Create task" }));
    await expect(alex.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  }
  beat("tasksDone", "alex");
  await shot(alex, "s4-tasks");

  // Teammates each pick up their to-do from the project home (Alex watches live)
  await alex.goto(projectPath);
  for (const p of [maya, ryan, sam]) await p.goto(projectPath);
  await alex.waitForTimeout(2000);
  beat("teamHere", "alex");
  const take = async (p: Page, who: Who, title: string) => {
    await moveClick(p, p.locator("section[aria-labelledby=help-h] li", { hasText: title }).getByRole("button", { name: "I'll do this" }));
    await p.waitForURL(/\/tasks\//);
    await expect(alex.locator("section[aria-labelledby=happening-h]")).toContainText(`working on “${title}”`, { timeout: 15000 });
    beat(`${who}Took`, "alex");
    await alex.waitForTimeout(1200);
  };
  await take(maya, "maya", "Design the user interface");
  await take(ryan, "ryan", "Build the application");
  await take(sam, "sam", "Interview potential users");
  await alex.waitForTimeout(1500);
  await shot(alex, "s4-team-working");

  // ---- Scene 5: Ryan's real AI agent builds it; Maya & Sam contribute in parallel
  await ryan.goto("/settings/agents");
  await ryan.getByLabel("Name").fill("Ryan's Claude Code");
  await ryan.getByRole("button", { name: "Create token" }).click();
  const token = (await ryan.getByLabel("token", { exact: true }).textContent())!.trim();
  await ryan.getByRole("button", { name: "Done" }).click();
  await alex.goto(`${projectPath}/build`);
  await ryan.goto(`${projectPath}/build`);
  await alex.waitForTimeout(1500);
  beat("buildPage", "alex");

  writeFileSync(path.join(SITE, "..", "mcp.json"), JSON.stringify({ mcpServers: { commonground: { type: "http", url: `${baseURL}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } }));
  const prompt = [
    `You are Ryan's coding agent for the CommonGround project "Campus Skill Exchange", reachable through the "commonground" MCP server. Do exactly these steps:`,
    `1. list_projects → find "Campus Skill Exchange". 2. list_tasks mine=true → the task "Build the application". 3. start_work with agent_label "Claude Code" (keep run_id). Then call get_project_context once.`,
    `4. report_progress stage "working", message "Building the landing page, student profiles and skill listings".`,
    `5. In the current directory create index.html: a polished single-page site (inline CSS, no external assets) titled "Campus Skill Exchange" with: a hero ("Trade skills, not tuition"), a "How it works" row (Offer · Match · Learn), a "Student profiles" section with 3 cards (Alex — teaches Guitar & Python, wants Design; Maya — teaches UI design, wants Spanish; Sam — teaches Spanish, wants Python), and a "Skill exchange listings" section with 4 listings showing offer ⇄ want. Warm off-white background, green accent #2f7a4f, rounded cards, system-ui font. Each section must have an id: hero, how, profiles, listings.`,
    `6. Create site.test.mjs using node:test and node:assert that reads index.html and checks: the title, the 4 section ids, exactly 3 profile cards (class "profile"), and 4 listings (class "listing").`,
    `7. Run: node --test site.test.mjs`,
    `8. report_progress stage "testing" with a short message and tests_passed / tests_failed from the real output.`,
    `9. report_progress stage "changes_ready", message "Landing page, profiles and listings are ready", files_changed ["index.html","site.test.mjs"].`,
    `10. submit_contribution with task_id, run_id, a one-sentence summary, authorship "agent_generated", agent_label "Claude Code".`,
  ].join("\n");
  const child = spawn("claude", ["-p", prompt, "--strict-mcp-config", "--mcp-config", path.join(SITE, "..", "mcp.json"), "--allowedTools", "mcp__commonground__*", "Write", "Read", "Edit", "Bash(node --test:*)"], { cwd: SITE, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let agentOut = "";
  child.stdout.on("data", (d) => (agentOut += d));
  child.stderr.on("data", (d) => (agentOut += d));
  const exited = new Promise<number>((res) => child.on("close", (c) => res(c ?? -1)));

  // In parallel: Maya shares her design, Sam his research (real submissions)
  await maya.goto(`${projectPath}/tasks`);
  await moveClick(maya, maya.getByRole("link", { name: /Design the user interface/ }).last());
  beat("mayaSubmitStart", "maya");
  await typeIn(maya.getByLabel("What did you do?"), "Mobile-first UI: home, profile and match screens. Big friendly cards, green accent.", 16);
  await maya.getByLabel("Link to the deliverable").fill("https://www.figma.com/");
  await moveClick(maya, maya.getByRole("button", { name: "Submit for review" }));
  beat("mayaSubmitted", "maya");
  await sam.goto(`${projectPath}/tasks`);
  await moveClick(sam, sam.getByRole("link", { name: /Interview potential users/ }).last());
  beat("samSubmitStart", "sam");
  await typeIn(sam.getByLabel("What did you do?"), "Interviewed 12 students: 10 would trade skills, top asks are coding, languages and music.", 16);
  await moveClick(sam, sam.getByRole("button", { name: "Submit for review" }));
  beat("samSubmitted", "sam");

  await expect(alex.getByText("Ryan's AI agent")).toBeVisible({ timeout: 240_000 });
  beat("agentStarted", "alex");
  await expect(alex.getByText(/tests passing/)).toBeVisible({ timeout: 300_000 });
  beat("agentTests", "alex");
  await alex.waitForTimeout(800);
  await shot(alex, "s5-agent");
  const code = await Promise.race([exited, new Promise<number>((res) => setTimeout(() => { child.kill(); res(-2); }, 360_000))]);
  writeFileSync(path.join(OUT, "agent-output.txt"), `exit=${code}\n${agentOut}`);
  await expect(alex.getByText("This agent's work is waiting for a review.")).toBeVisible({ timeout: 60_000 });
  beat("agentDone", "alex");
  await alex.waitForTimeout(1200);
  await shot(alex, "s5-agent-done");

  // ---- Scene 6: review & launch
  await ryan.reload();
  beat("ryanReview", "ryan");
  await moveClick(ryan, ryan.getByRole("button", { name: "Looks good — send to the team" }));
  await expect(alex.locator("section[aria-labelledby=ai-h]")).toContainText(/finished/, { timeout: 15000 });
  beat("sentToTeam", "alex");
  await alex.waitForTimeout(1000);
  for (const title of ["Build the application", "Design the user interface", "Interview potential users"]) {
    await alex.goto(`${projectPath}/tasks`);
    await moveClick(alex, alex.getByRole("link", { name: new RegExp(title) }).last());
    if (title === "Build the application") beat("reviewBuild", "alex");
    await moveClick(alex, alex.getByRole("button", { name: "Approve & verify" }));
    await expect(alex.getByText("Verified", { exact: true })).toBeVisible();
    if (title === "Build the application") { beat("verifiedBuild", "alex"); await alex.waitForTimeout(800); await shot(alex, "s6-verified"); }
  }
  // Alex's own idea gets credited by a teammate (Maya becomes admin first — not filmed)
  d1(`UPDATE project_members SET role = 'admin' WHERE user_id = (SELECT user_id FROM profiles WHERE username = '${people.maya.username}')`);
  await alex.goto(`${projectPath}/contributors`);
  await alex.getByRole("button", { name: "Log a contribution" }).click();
  await alex.getByLabel("Title").fill("Original idea & project lead");
  await alex.getByRole("button", { name: "Log it" }).click();
  await maya.goto(`${projectPath}/contributors`);
  await maya.getByRole("button", { name: "Verify" }).first().click();
  await maya.waitForTimeout(800);

  // The real site the agent built
  const site = await A.ctx.newPage();
  await site.goto(`file://${path.join(SITE, "index.html")}`);
  await site.waitForTimeout(1200);
  beat("siteOpen", "alex");
  await site.mouse.wheel(0, 500); await site.waitForTimeout(900);
  await site.mouse.wheel(0, 600); await site.waitForTimeout(900);
  await site.mouse.wheel(0, 700); await site.waitForTimeout(1200);
  beat("siteScrolled", "alex");
  await site.screenshot({ path: path.join(OUT, "shots", "s6-site-top.png") });
  await site.screenshot({ path: path.join(OUT, "shots", "s6-site-full.png"), fullPage: true });
  await site.close();

  // Mark completed + share the outcome
  await alex.goto(`${projectPath}/updates`);
  await alex.getByLabel("Update title").fill("Campus Skill Exchange is live 🎉");
  await alex.getByRole("switch", { name: "Milestone" }).click();
  await alex.getByRole("button", { name: "Publish update" }).click();
  await alex.waitForTimeout(800);
  await alex.goto(`${projectPath}/settings`);
  await alex.locator("#s-status").click();
  await alex.getByRole("option", { name: "Completed" }).click();
  await alex.getByRole("button", { name: "Save changes" }).click();
  await alex.waitForTimeout(800);
  await alex.goto(`${projectPath}/contributors`);
  await alex.waitForTimeout(1500);
  beat("team", "alex");
  await shot(alex, "s6-team");
  await alex.goto(projectPath);
  await alex.waitForTimeout(2000);
  beat("completedHome", "alex");
  await shot(alex, "s6-completed");

  // ---- Scene 7: the wider community
  await alex.goto("/?sort=top&t=all");
  await alex.waitForTimeout(1500);
  beat("communityFeed", "alex");
  await alex.mouse.move(700, 400, { steps: 10 });
  await alex.mouse.wheel(0, 700); await alex.waitForTimeout(1500);
  await shot(alex, "s7-feed");
  await alex.goto("/collaborate");
  await alex.waitForTimeout(1500);
  beat("projectsPage", "alex");
  await shot(alex, "s7-projects");

  // Save recordings
  const videos: Record<string, string> = {};
  for (const [who, h] of Object.entries({ alex: A, maya: M, ryan: R, sam: S })) {
    const v = h.page.video();
    await h.ctx.close();
    if (v) { const src = await v.path(); const dst = path.join(OUT, `${who}.webm`); renameSync(src, dst); videos[who] = dst; }
  }
  writeFileSync(path.join(OUT, "beats.json"), JSON.stringify({ beats, videos, projectPath, postUrl, people, agentExit: code }, null, 2));
  expect(existsSync(path.join(SITE, "index.html"))).toBe(true);
  console.log(readdirSync(OUT));
});
