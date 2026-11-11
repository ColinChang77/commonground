import "server-only";
import { inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { skills } from "@/db/schema";
import { newId, slugify } from "@/lib/ids";

/** Upserts free-text skill names and returns their ids (deduplicated by slug). */
export async function ensureSkills(db: DB, names: string[]): Promise<string[]> {
  const bySlug = new Map<string, string>();
  for (const n of names) {
    const slug = slugify(n, 40);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, n.trim().slice(0, 40));
  }
  if (!bySlug.size) return [];
  const slugs = [...bySlug.keys()];
  await db
    .insert(skills)
    .values(slugs.map((slug) => ({ id: newId(), slug, name: bySlug.get(slug)! })))
    .onConflictDoNothing({ target: skills.slug });
  const rows = await db.select({ id: skills.id }).from(skills).where(inArray(skills.slug, slugs));
  return rows.map((r) => r.id);
}
