import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { d1, signUp } from "../e2e/helpers";

// Records the 90-second hackathon demo against the local app (npm run dev on :3100 + realtime worker on :8790).
// Two real signed-in browsers: left = non-technical viewer, right = builder. Captions are drawn in-page.
// Demo data: the accounts and post below are created fresh for the recording and labelled Demo mode in the UI.
const OUT = process.env.DEMO_OUT ?? path.resolve("test-results/demo-90s");
const r = Date.now().toString(36);
const VIEWER = { name: "Leo Park", email: `leo-${r}@example.test`, username: `leo_${r}` };
const BUILDER = { name: "Maya Chen", email: `maya-${r}@example.test`, username: `maya_${r}` };
const TITLE = "Pocket Budget — a tiny expense tracker for students";
const SIZE = { width: 960, height: 1080 };

async function center(p: Page, testId: string) {
  await p.getByTestId(testId).first().evaluate((e) => e.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => {});
}

async function caption(p: Page, role: string, text: string) {
  await p.evaluate(([role, text]) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;font:600 23px/1.3 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.86);padding:16px 26px 18px";
      document.body.appendChild(el);
      const tag = document.createElement("div");
      tag.id = "__tag";
      tag.style.cssText = "position:fixed;top:10px;right:10px;z-index:2147483647;pointer-events:none;font:700 15px system-ui;color:#fff;background:#2f7a4f;border-radius:999px;padding:6px 14px";
      document.body.appendChild(tag);
    }
    el.innerHTML = text;
    document.getElementById("__tag")!.textContent = role;
  }, [role, text]);
}

test("90-second demo: comment → change request → live multiplayer AI → PR → points", async () => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });

  // ---- Setup (not recorded) ----
  // Local test DB only: remove the post left by an earlier recording so the feed shows exactly one.
  d1(`DELETE FROM discussions WHERE title = '${TITLE}'`);
  const sv = await browser.newContext({ viewport: SIZE });
  const sb = await browser.newContext({ viewport: SIZE });
  const v0 = await sv.newPage(), b0 = await sb.newPage();
  await signUp(v0, VIEWER.name, VIEWER.email, VIEWER.username);
  await signUp(b0, BUILDER.name, BUILDER.email, BUILDER.username);
  await b0.goto("/create");
  await b0.getByLabel("Title").fill(TITLE);
  await b0.locator("#body").fill("Built this over the weekend: log an expense in two taps and see where your money goes each week. Try it on your phone and tell me what you'd change — plain words are perfect.");
  await b0.getByRole("radio", { name: "Technology" }).click();
  await b0.getByRole("button", { name: "Post" }).click();
  await expect(b0).toHaveURL(/\/d\//);
  const id = new URL(b0.url()).pathname.split("/")[2];
  d1(`INSERT INTO showcases (discussion_id, builder_id, repo_full_name, demo_mode) VALUES ('${id}', (SELECT author_id FROM discussions WHERE id = '${id}'), 'maya-chen/pocket-budget', 1)`);
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
  await expect(viewer.getByText(TITLE)).toBeVisible();
  await viewer.waitForTimeout(1500);

  // 1 — problem (5 s)
  mark("start");
  await Promise.all([caption(viewer, VR, "<b>Feedback dies in comment sections.</b><br>Non-developers have the best ideas and no way to ship them."), caption(builder, BR, "<b>Feedback dies in comment sections.</b><br>Non-developers have the best ideas and no way to ship them.")]);
  await viewer.waitForTimeout(5000);

  // 2 — builder's work + plain-language comment (15 s)
  const c2 = "<b>A builder shares their work.</b> A viewer just comments, in plain words.";
  await Promise.all([caption(viewer, VR, c2), caption(builder, BR, c2)]);
  await viewer.getByText("Showcase").first().scrollIntoViewIfNeeded();
  await viewer.waitForTimeout(4000);
  await viewer.getByRole("link", { name: TITLE }).click();
  await expect(viewer.getByTestId("showcase-meta")).toBeVisible();
  await caption(viewer, VR, c2);
  await viewer.waitForTimeout(3000);
  const box = viewer.locator("textarea").first();
  await box.scrollIntoViewIfNeeded();
  await box.click();
  await box.pressSequentially("The button is too small on my phone, I keep missing it.", { delay: 75 });
  await viewer.waitForTimeout(800);
  await viewer.getByRole("button", { name: "Comment" }).click();
  mark("commented");

  // 3 — AI restates it as a change request; viewer confirms (≈20 s)
  const c3 = "<b>An agent turns the comment into a change request</b> and asks one question back. The viewer taps <i>Yes, that's what I meant.</i>";
  await expect(viewer.getByTestId("suggestion-card")).toBeVisible();
  await Promise.all([caption(viewer, VR, c3), caption(builder, BR, c3)]);
  await builder.getByTestId("suggestion-card").waitFor().catch(() => {});
  await Promise.all([center(builder, "suggestion-card"), center(viewer, "suggestion-card")]);
  await viewer.waitForTimeout(12000);
  await viewer.getByRole("button", { name: "Yes, that's what I meant" }).click();
  mark("confirmed");

  // 4 — multiplayer AI: both watch every step live (≈25 s)
  const c4 = "<b>Multiplayer AI.</b> The builder, viewers and agents share one thread — everyone watches the work happen live.";
  await Promise.all([caption(viewer, VR, c4), caption(builder, BR, c4)]);
  await viewer.waitForTimeout(600);
  await Promise.all([center(builder, "suggestion-card"), center(viewer, "suggestion-card")]);
  await expect(builder.getByTestId("suggestion-status")).toHaveText("Ready for your approval", { timeout: 40_000 });
  mark("ready");
  await center(builder, "suggestion-card");
  await builder.waitForTimeout(8000);

  // 5 — builder approves → PR (demo) → viewer earns points (≈20 s)
  const c5 = "<b>The builder approves. A pull request opens.</b> The viewer who had the idea earns contribution points.";
  await Promise.all([caption(viewer, VR, c5), caption(builder, BR, c5)]);
  await builder.getByRole("button", { name: "Approve & open PR" }).click();
  await expect(builder.getByText(/PR #\d+/)).toBeVisible();
  await expect(viewer.getByText("The maker adopted your suggestion").first()).toBeVisible({ timeout: 20_000 });
  mark("adopted");
  await center(viewer, "suggestion-card");
  await viewer.waitForTimeout(5000);
  await viewer.goto(`/u/${VIEWER.username}`);
  await expect(viewer.getByTestId("points-section")).toContainText("10 contribution points");
  await caption(viewer, VR, c5);
  await builder.reload();
  await center(builder, "showcase-meta");
  await caption(builder, BR, c5);
  await viewer.waitForTimeout(9000);

  // 6 — close (5 s)
  const c6 = "<b>CommonGround — from comments to commits, together.</b><br><span style='font-size:18px;opacity:.8'>Demo mode: AI, sandbox and GitHub are labelled test doubles in this build.</span>";
  await Promise.all([caption(viewer, VR, c6), caption(builder, BR, c6)]);
  await viewer.waitForTimeout(5500);
  mark("end");

  writeFileSync(path.join(OUT, "marks.json"), JSON.stringify({ discussionId: id, viewer: VIEWER.username, builder: BUILDER.username, marks }, null, 2));
  await viewer.screenshot({ path: path.join(OUT, "viewer-profile-1440.png") }).catch(() => {});
  await cv.close(); await cb.close();
  await browser.close();
});
