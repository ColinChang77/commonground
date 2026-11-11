import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

/** Reads from the local D1 the dev server uses (dev-only email sink — never written in production). */
export function d1(sql: string): Record<string, unknown>[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "commonground", "--local", "--json", "--command", sql], { encoding: "utf8" });
  return JSON.parse(out)[0].results;
}

export function latestMailUrl(email: string) {
  const rows = d1(`SELECT url FROM dev_outbox WHERE "to" = '${email.replace(/'/g, "''")}' ORDER BY created_at DESC LIMIT 1`);
  if (!rows.length) throw new Error(`no mail for ${email}`);
  return String(rows[0].url);
}

export async function signUp(page: Page, name: string, email: string, username: string) {
  // Local test DB only: reset auth rate-limit counters so repeated runs don't hit the 10 sign-ups/hour limit.
  d1("DELETE FROM rate_limit");
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await page.goto(latestMailUrl(email));
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL("/");
}
