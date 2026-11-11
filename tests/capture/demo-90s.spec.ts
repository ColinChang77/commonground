import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { d1, signUp } from "../e2e/helpers";

// Records the 90-second hackathon demo against the local app (npm run dev on :3100 + realtime worker on :8790).
// Two recorded, signed-in browsers: left = non-technical viewer, right = builder. A third (unrecorded) person posts
// a low-quality comment live. Caption timings are written to marks.json; tests/capture/compose-demo.mjs lays one
// full-width caption bar over the side-by-side video. Demo data is created fresh and labelled Demo mode in the UI.
const OUT = process.env.DEMO_OUT ?? path.resolve("test-results/demo-90s");
const r = Date.now().toString(36);
const VIEWER = { name: "Leo Park", email: `leo-${r}@example.test`, username: `leo_${r}` };
const BUILDER = { name: "Maya Chen", email: `maya-${r}@example.test`, username: `maya_${r}` };
const THIRD = { name: "Sam Ortiz", email: `sam-${r}@example.test`, username: `sam_${r}` };
const TITLE = "Pocket Budget — a tiny expense tracker for students";
const SIZE = { width: 960, height: 1080 };

async function tag(p: Page, role: string) {
  await p.evaluate((role) => {
    let t = document.getElementById("__tag");
    if (!t) {
      t = document.createElement("div");
      t.id = "__tag";
      t.style.cssText = "position:fixed;top:10px;right:10px;z-index:2147483647;pointer-events:none;font:700 15px system-ui;color:#fff;background:#2f7a4f;border-radius:999px;padding:6px 14px";
      document.body.appendChild(t);
      // Room below the content so the caption bar laid over the bottom never hides what's being shown.
      const st = document.createElement("style");
      st.textContent = "main, #main { padding-bottom: 260px !important; }";
      document.head.appendChild(st);
    }
    t.textContent = role;
  }, role);
}

async function center(p: Page, testId: string) {
  await p.getByTestId(testId).last().evaluate((e) => e.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => {});
}

test("90-second demo: comment → change request → live agents → recording review → filter → PR → points", async () => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });

  // ---- Setup (not recorded) ----
  d1(`DELETE FROM discussions WHERE title = '${TITLE}'`); // local test DB only: one demo post in the feed
  const sv = await browser.newContext({ viewport: SIZE });
  const sb = await browser.newContext({ viewport: SIZE });
  const ss = await browser.newContext({ viewport: SIZE });
  const v0 = await sv.newPage(), b0 = await sb.newPage(), third = await ss.newPage();
  await signUp(v0, VIEWER.name, VIEWER.email, VIEWER.username);
  await signUp(b0, BUILDER.name, BUILDER.email, BUILDER.username);
  await signUp(third, THIRD.name, THIRD.email, THIRD.username);
  await b0.goto("/create");
  await b0.getByLabel("Title").fill(TITLE);
  await b0.locator("#body").fill("Built this over the weekend: log an expense in two taps and see where your money goes each week. Try it on your phone and tell me what you'd change — plain words are perfect.");
  await b0.getByRole("radio", { name: "Technology" }).click();
  await b0.getByRole("button", { name: "Post" }).click();
  await expect(b0).toHaveURL(/\/d\//);
  const id = new URL(b0.url()).pathname.split("/")[2];
  d1(`INSERT INTO showcases (discussion_id, builder_id, repo_full_name, demo_mode) VALUES ('${id}', (SELECT author_id FROM discussions WHERE id = '${id}'), 'maya-chen/pocket-budget', 1)`);
  // An earlier comment that the filter correctly leaves alone (praise, not a change request).
  await third.goto(`/d/${id}`);
  await third.locator("textarea").first().fill("Love this, great work!");
  await third.getByRole("button", { name: "Comment" }).click();
  await expect(third.getByText("Love this, great work!")).toBeVisible();
  const vState = await sv.storageState(), bState = await sb.storageState();
  await sv.close(); await sb.close();

  // ---- Recorded ----
  const cv = await browser.newContext({ viewport: SIZE, storageState: vState, recordVideo: { dir: path.join(OUT, "viewer"), size: SIZE } });
  const cb = await browser.newContext({ viewport: SIZE, storageState: bState, recordVideo: { dir: path.join(OUT, "builder"), size: SIZE } });
  const t0 = Date.now();
  const viewer = await cv.newPage(), builder = await cb.newPage();
  const marks: Record<string, number> = {};
  const mark = (k: string) => { marks[k] = (Date.now() - t0) / 1000; };
  const VR = "Viewer · Leo (doesn't code)", BR = "Builder · Maya";
  await Promise.all([viewer.goto("/?sort=new"), builder.goto(`/d/${id}`)]);
  await expect(viewer.getByRole("link", { name: TITLE })).toBeVisible();
  await Promise.all([tag(viewer, VR), tag(builder, BR)]);
  await viewer.waitForTimeout(1200);

  // 1 — problem
  mark("c1");
  await viewer.getByText("Showcase").first().scrollIntoViewIfNeeded();
  await viewer.waitForTimeout(4000);

  // 2 — builder's work + plain-language comment
  mark("c2");
  await viewer.getByRole("link", { name: TITLE }).click();
  await expect(viewer.getByTestId("showcase-meta")).toBeVisible();
  await tag(viewer, VR);
  await viewer.waitForTimeout(3000);
  const box = viewer.locator("textarea").first();
  await box.scrollIntoViewIfNeeded();
  await box.click();
  await box.pressSequentially("The button is too small on my phone, I keep missing it.", { delay: 60 });
  await viewer.getByRole("button", { name: "Comment" }).click();

  // 3 — AI restates it as a change request; viewer confirms (gate 1)
  await expect(viewer.getByTestId("suggestion-card")).toBeVisible();
  mark("c3");
  await builder.getByTestId("suggestion-card").waitFor().catch(() => {});
  await Promise.all([center(builder, "suggestion-card"), center(viewer, "suggestion-card")]);
  await viewer.waitForTimeout(7500);
  await viewer.getByRole("button", { name: "Yes, that's what I meant" }).click();

  // 4 — multiplayer AI: both watch every step live
  mark("c4");
  await viewer.waitForTimeout(500);
  await Promise.all([center(builder, "suggestion-card"), center(viewer, "suggestion-card")]);
  await expect(viewer.getByTestId("preview-video")).toBeVisible({ timeout: 40_000 });

  // 5 — the commenter reviews a screen recording, not a diff (gate 2)
  mark("c5");
  await Promise.all([center(builder, "preview-video"), center(viewer, "preview-video")]);
  await viewer.waitForTimeout(8000);
  await viewer.getByRole("button", { name: "Looks right" }).click();
  await expect(builder.getByTestId("suggestion-status")).toHaveText("Ready for your approval", { timeout: 20_000 });
  await viewer.waitForTimeout(1500);

  // 6 — not every comment becomes a PR: a low-quality comment arrives live and is held back
  mark("c6");
  await third.locator("textarea").first().fill("this looks bad lol");
  await third.getByRole("button", { name: "Comment" }).click();
  await expect(viewer.getByTestId("ai-reply")).toBeVisible({ timeout: 20_000 });
  await center(viewer, "ai-reply");
  await builder.getByTestId("inbox-link").scrollIntoViewIfNeeded();
  await builder.waitForTimeout(800);
  await builder.getByTestId("inbox-link").click();
  await expect(builder.getByTestId("funnel")).toBeVisible();
  await tag(builder, BR);
  await expect(builder.getByTestId("col-filtered")).toContainText("this looks bad lol");
  await center(viewer, "ai-reply");
  await viewer.waitForTimeout(8500);

  // 7 — builder approves (gate 3) → PR (demo) → viewer earns points
  mark("c7");
  await builder.getByTestId("col-approve").getByRole("button", { name: "Approve & open PR" }).click();
  await expect(builder.getByTestId("col-pr")).toContainText("PR #", { timeout: 20_000 });
  await expect(viewer.getByText("The maker adopted your suggestion").first()).toBeVisible({ timeout: 20_000 });
  await center(viewer, "suggestion-card");
  await viewer.waitForTimeout(4000);
  await viewer.goto(`/u/${VIEWER.username}`);
  await expect(viewer.getByTestId("points-section")).toContainText("10 contribution points");
  await tag(viewer, VR);
  await viewer.waitForTimeout(6500);

  // 8 — close
  mark("c8");
  await viewer.waitForTimeout(5000);
  mark("end");

  writeFileSync(path.join(OUT, "marks.json"), JSON.stringify({ discussionId: id, viewer: VIEWER.username, builder: BUILDER.username, third: THIRD.username, marks }, null, 2));
  await builder.screenshot({ path: path.join(OUT, "builder-inbox.png") }).catch(() => {});
  await cv.close(); await cb.close(); await ss.close();
  await browser.close();
});
