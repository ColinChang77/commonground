import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function openOpportunities(limit = 5) {
  return getDb().all<{ id: string; title: string; compensation: string; projectTitle: string; projectSlug: string }>(sql`
    SELECT o.id, o.title, o.compensation, p.title AS projectTitle, p.slug AS projectSlug
    FROM opportunities o JOIN projects p ON p.id = o.project_id
    WHERE o.status = 'open' AND p.visibility = 'public' AND p.status != 'archived'
      AND (o.deadline IS NULL OR o.deadline > unixepoch() * 1000)
    ORDER BY o.created_at DESC LIMIT ${limit}`);
}
