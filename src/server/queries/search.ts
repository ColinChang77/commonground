import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type SearchType = "all" | "discussion" | "project" | "opportunity" | "user";
export type Hit = { type: string; id: string; title: string; snippet: string; href: string; meta: string | null };

/** Turns free text into a safe FTS5 query: quoted prefix terms joined by AND. */
export function ftsQuery(q: string) {
  const terms = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  return terms.map((t) => `"${t}"*`).join(" ");
}

export async function search(q: string, type: SearchType, viewerId: string | null, opts: { category?: string | null; status?: string | null } = {}) {
  const match = ftsQuery(q);
  if (!match) return [];
  const v = viewerId ?? "";
  const typeFilter = type === "all" ? sql`` : sql`AND f.entity_type = ${type}`;
  // Visibility is enforced in SQL for every entity type: private projects and their contents only match for members.
  return getDb().all<Hit>(sql`
    SELECT f.entity_type AS type, f.entity_id AS id,
      COALESCE(d.title, pr.title, o.title, pf.display_name) AS title,
      snippet(search_fts, 3, '[[', ']]', '…', 14) AS snippet,
      CASE f.entity_type WHEN 'discussion' THEN '/d/' || d.id WHEN 'project' THEN '/p/' || pr.slug WHEN 'opportunity' THEN '/p/' || op.slug || '/opportunities#' || o.id ELSE '/u/' || pf.username END AS href,
      CASE f.entity_type WHEN 'discussion' THEN d.category WHEN 'project' THEN pr.status WHEN 'opportunity' THEN op.title ELSE '@' || pf.username END AS meta
    FROM search_fts f
    LEFT JOIN discussions d ON f.entity_type = 'discussion' AND d.id = f.entity_id AND d.status = 'published'
      AND (d.project_id IS NULL OR EXISTS (SELECT 1 FROM projects x WHERE x.id = d.project_id AND (x.visibility = 'public' OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = x.id AND m.user_id = ${v}))))
    LEFT JOIN projects pr ON f.entity_type = 'project' AND pr.id = f.entity_id AND (pr.visibility = 'public' OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = pr.id AND m.user_id = ${v}))
    LEFT JOIN opportunities o ON f.entity_type = 'opportunity' AND o.id = f.entity_id AND o.status = 'open'
    LEFT JOIN projects op ON op.id = o.project_id AND op.visibility = 'public'
    LEFT JOIN profiles pf ON f.entity_type = 'user' AND pf.user_id = f.entity_id AND pf.suspended_at IS NULL
    WHERE search_fts MATCH ${match} ${typeFilter}
      AND (d.id IS NOT NULL OR pr.id IS NOT NULL OR (o.id IS NOT NULL AND op.id IS NOT NULL) OR pf.user_id IS NOT NULL)
      ${opts.category ? sql`AND (d.category = ${opts.category} OR pr.category = ${opts.category} OR op.category = ${opts.category})` : sql``}
      ${opts.status ? sql`AND pr.status = ${opts.status}` : sql``}
    ORDER BY rank LIMIT 40`);
}
