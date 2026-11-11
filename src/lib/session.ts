import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";

export type Viewer = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  profile: typeof profiles.$inferSelect | null;
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Read request headers first: this marks the route dynamic before any Cloudflare binding is touched.
  const h = await headers();
  const s = await getAuth().api.getSession({ headers: h });
  if (!s) return null;
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, s.user.id)).limit(1);
  return {
    id: s.user.id,
    email: s.user.email,
    name: s.user.name,
    emailVerified: Boolean(s.user.emailVerified),
    image: s.user.image ?? null,
    profile: profile ?? null,
  };
});

/** For pages: signed-in, onboarded users only. */
export async function requireViewer(next = "/"): Promise<Viewer & { profile: NonNullable<Viewer["profile"]> }> {
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!v.profile) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return v as Viewer & { profile: NonNullable<Viewer["profile"]> };
}

export function isStaff(v: Viewer | null) {
  return v?.profile?.platformRole === "admin" || v?.profile?.platformRole === "moderator";
}
