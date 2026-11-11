import "server-only";
import { createDb } from "@/db";
import { devOutbox } from "@/db/schema";
import { newId } from "@/lib/ids";
import { type AppEnv, isProduction, secret } from "@/lib/env";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email delivery is not configured (set RESEND_API_KEY and EMAIL_FROM).");
  }
}

type Mail = { to: string; subject: string; text: string; html: string; url?: string };

/**
 * Sends transactional email through Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
 * In development without a provider, mail is written to the `dev_outbox` table and logged so
 * flows can be exercised locally. In production a missing provider is a hard error — we never
 * pretend an email was sent.
 */
export async function sendEmail(env: AppEnv, mail: Mail) {
  const key = secret("RESEND_API_KEY", env);
  const from = secret("EMAIL_FROM", env);
  if (key && from) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Email provider rejected the message (${res.status})`);
    return;
  }
  if (isProduction(env)) throw new EmailNotConfiguredError();
  await createDb(env.DB)
    .insert(devOutbox)
    .values({ id: newId(), to: mail.to, subject: mail.subject, body: mail.text, url: mail.url ?? null });
  console.info(`[dev-mail] to=${mail.to} subject="${mail.subject}" url=${mail.url ?? "-"}`);
}

export function actionEmail(opts: { heading: string; body: string; cta: string; url: string }) {
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.cta}: ${opts.url}\n\nIf you didn't request this, you can ignore this email.\n— CommonGround`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#2a2620">
<h2 style="margin:0 0 12px">${esc(opts.heading)}</h2><p style="line-height:1.6">${esc(opts.body)}</p>
<p><a href="${esc(opts.url)}" style="display:inline-block;background:#2f7a4f;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">${esc(opts.cta)}</a></p>
<p style="color:#7a736a;font-size:13px">If you didn't request this, you can ignore this email.</p></div>`;
  return { text, html };
}
