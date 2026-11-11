/**
 * Demo execution backend artifact: records real phone-size screen recordings of the demo target page
 * (public/demo-target/pocket-budget.html) before and after the change, and stitches them side by side.
 * In production the cloud sandbox records the pull request's preview deployment instead.
 *
 *   node scripts/record-previews.mjs            # needs `npm run dev` on :3100 and ffmpeg on PATH
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = path.resolve("public/demo-previews");
const PHONE = { width: 390, height: 844 };
const work = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "cg-preview-"));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });

async function record(variant) {
  const dir = path.join(work, variant);
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir, size: PHONE } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo-target/pocket-budget.html?v=${variant}`);
  await page.waitForTimeout(700);
  for (const [x, y] of [[195, 806], [250, 812], [160, 800]]) {
    await page.evaluate(([x, y]) => window.thumbTap(x, y), [x, y]);
    await page.waitForTimeout(1100);
  }
  await ctx.close();
  return path.join(dir, readdirSync(dir)[0]);
}

const before = await record("before");
const after = await record("after");
const after2 = await record("after2");
await browser.close();
for (const [name, b, a] of [["round1", before, after], ["round2", before, after2]]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", b, "-i", a, "-filter_complex", "[0:v][1:v]hstack=inputs=2,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", "-crf", "30", "-preset", "medium", "-movflags", "+faststart", path.join(OUT, `${name}.mp4`)]);
}
rmSync(work, { recursive: true, force: true });
console.log("wrote", readdirSync(OUT).join(", "));
