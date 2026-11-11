/**
 * Composes the demo: left = viewer recording, right = builder recording, one full-width caption bar
 * timed from marks.json (written by tests/capture/demo-90s.spec.ts). Needs ffmpeg and the system Chrome.
 *   node tests/capture/compose-demo.mjs <recording dir> <out.mp4>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [dir, out] = process.argv.slice(2);
const { marks } = JSON.parse(readFileSync(path.join(dir, "marks.json"), "utf8"));
const pick = (sub) => readdirSync(path.join(dir, sub)).map((f) => path.join(dir, sub, f)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
const CAPS = [
  "<b>Feedback dies in comment sections.</b> Non-developers have the best ideas and no way to ship them.",
  "<b>A builder shares their work.</b> A viewer just comments, in plain words.",
  "<b>An agent turns the comment into a change request</b> and asks one question back. The viewer taps <i>Yes, that's what I meant.</i>",
  "<b>Multiplayer AI.</b> The builder, viewers and agents share one thread — everyone watches the work happen live.",
  "<b>Non-developers review a screen recording, not a diff.</b> Before and after, on a phone.",
  "<b>Not every comment becomes a PR.</b> Three gates: the commenter, the recording, the builder.",
  "<b>The builder approves. A pull request opens.</b> The viewer who had the idea earns contribution points.",
  "<b>CommonGround — from comments to commits, together.</b> <span style='opacity:.75;font-size:20px'>Demo mode: AI, sandbox and GitHub are labelled test doubles in this build.</span>",
];
const capDir = path.join(dir, "caps");
mkdirSync(capDir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 140 } });
for (let i = 0; i < CAPS.length; i++) {
  await page.setContent(`<body style="margin:0;width:1920px;height:140px;background:#111;display:flex;align-items:center;justify-content:center"><div style="font:500 30px/1.35 system-ui,-apple-system,sans-serif;color:#fff;text-align:center;max-width:1760px">${CAPS[i]}</div></body>`);
  await page.screenshot({ path: path.join(capDir, `cap${i + 1}.png`) });
}
await browser.close();

const start = marks.c1;
const t = (k) => Math.max(0, marks[k] - start);
const bounds = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map(t);
const total = Math.min(90, t("end"));
const inputs = ["-ss", String(start), "-i", pick("viewer"), "-ss", String(start), "-i", pick("builder")];
for (let i = 1; i <= CAPS.length; i++) inputs.push("-loop", "1", "-i", path.join(capDir, `cap${i}.png`));
let chain = "[0:v][1:v]hstack=inputs=2[s0]";
for (let i = 0; i < CAPS.length; i++) {
  const from = bounds[i], to = i + 1 < bounds.length ? bounds[i + 1] : total + 1;
  chain += `;[s${i}][${i + 2}:v]overlay=0:H-h:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})':shortest=1[s${i + 1}]`;
}
chain += `;[s${CAPS.length}]format=yuv420p[v]`;
execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", chain, "-map", "[v]", "-t", total.toFixed(2), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "25", "-movflags", "+faststart", out], { stdio: "inherit" });
console.log(`wrote ${out} (${total.toFixed(1)} s)`);
