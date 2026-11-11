import "server-only";
import { z } from "zod";
import { getViewer, type Viewer } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class ActionError extends Error {}

export const ok = <T,>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
});

export type ActiveViewer = Viewer & { profile: NonNullable<Viewer["profile"]> };

/**
 * Gate for every mutating server action: signed in, verified email, onboarded, not suspended,
 * and under the per-user rate limit for this action bucket.
 */
export async function activeViewer(bucket: string, limit = 30, windowSec = 60): Promise<ActiveViewer> {
  const v = await getViewer();
  if (!v) throw new ActionError("Please sign in first.");
  if (!v.emailVerified) throw new ActionError("Confirm your email address to continue.");
  if (!v.profile) throw new ActionError("Finish setting up your profile first.");
  if (v.profile.suspendedAt) throw new ActionError("Your account is suspended. Contact support if you think this is a mistake.");
  const allowed = await rateLimit(`${bucket}:${v.id}`, limit, windowSec);
  if (!allowed) throw new ActionError("You're doing that too often. Please wait a moment and try again.");
  return v as ActiveViewer;
}

export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".") || "_";
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

/** Wraps an action body so thrown ActionErrors / validation errors become typed results. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message);
    if (e instanceof z.ZodError) return fail("Please check the highlighted fields.", zodFieldErrors(e));
    // Next.js redirect()/notFound() throw control-flow errors that must propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[action] unexpected error", e);
    return fail("Something went wrong on our side. Please try again.");
  }
}
