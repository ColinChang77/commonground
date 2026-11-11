import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { CalendarClock, Clock3, Handshake, Package } from "lucide-react";
import { getDb } from "@/db";
import { nowMs } from "@/lib/clock";
import { loadProject } from "@/server/queries/project";
import { compensationLabel } from "@/lib/constants";
import { EmptyState } from "@/components/empty-state";
import { ApplyButton, Applicants, NewOpportunity, OpportunityStatusControl, type ApplicantRow } from "@/components/project/opportunity-ui";

type Opp = { id: string; title: string; description: string; deliverable: string; commitment: string; compensation: string; deadline: number | null; status: string; skills: string | null; myStatus: string | null; myAppId: string | null };

export default async function Opportunities({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadProject(slug);
  if (!data) notFound();
  const { project, access, viewer, role } = data;
  const db = getDb();
  const v = viewer?.id ?? "";
  const manager = access.can("application.review");
  const opps = await db.all<Opp>(sql`
    SELECT o.id, o.title, o.description, o.deliverable, o.commitment, o.compensation, o.deadline, o.status,
      (SELECT group_concat(s.name, '|') FROM opportunity_skills os JOIN skills s ON s.id = os.skill_id WHERE os.opportunity_id = o.id) AS skills,
      (SELECT status FROM applications a WHERE a.opportunity_id = o.id AND a.applicant_id = ${v}) AS myStatus,
      (SELECT id FROM applications a WHERE a.opportunity_id = o.id AND a.applicant_id = ${v}) AS myAppId
    FROM opportunities o WHERE o.project_id = ${project.id} ${manager ? sql`` : sql`AND o.status = 'open'`}
    ORDER BY CASE o.status WHEN 'open' THEN 0 ELSE 1 END, o.created_at DESC`);
  const applicants = manager
    ? await db.all<ApplicantRow & { opportunityId: string }>(sql`
        SELECT a.id, a.opportunity_id AS opportunityId, a.message, a.status, a.created_at AS createdAt, p.username, p.display_name AS displayName, p.avatar_key AS avatarKey, p.bio
        FROM applications a JOIN profiles p ON p.user_id = a.applicant_id
        WHERE a.project_id = ${project.id} AND a.status != 'withdrawn' ORDER BY a.created_at DESC`)
    : [];
  const isMember = role !== null && role !== "viewer";

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5">
      {access.can("opportunity.manage") && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
          <p className="text-sm text-muted-foreground">Post a role and we&apos;ll show it in Collaborate and on the Explore sidebar.</p>
          <NewOpportunity projectId={project.id} />
        </div>
      )}
      {opps.length === 0 ? (
        <EmptyState icon={Handshake} title="No open roles right now">{manager ? "Create an opportunity to start recruiting collaborators." : "Check back later, or follow the project's updates."}</EmptyState>
      ) : (
        opps.map((o) => {
          const expired = o.deadline != null && o.deadline < nowMs();
          const state = isMember ? "member" : o.status !== "open" || expired ? "closed" : ((o.myStatus as "pending") ?? "none");
          const apps = applicants.filter((a) => a.opportunityId === o.id);
          return (
            <article key={o.id} id={o.id} className="scroll-mt-20 rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{o.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{compensationLabel(o.compensation)}</span>
                    {o.commitment && <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {o.commitment}</span>}
                    {o.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> {expired ? "Closed" : "Apply by"} {new Date(o.deadline).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                    {o.status !== "open" && <span className="rounded-full bg-muted px-2 capitalize">{o.status}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {access.can("opportunity.manage") && <OpportunityStatusControl id={o.id} status={o.status} />}
                  {!manager && <ApplyButton opportunityId={o.id} title={o.title} state={state} applicationId={o.myAppId ?? undefined} signedIn={Boolean(viewer?.profile)} signInHref={`/sign-in?next=/p/${slug}/opportunities`} />}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-[0.93rem]">{o.description}</p>
              {o.deliverable && <p className="mt-2 flex gap-2 text-sm"><Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> <span><span className="text-muted-foreground">Deliverable:</span> {o.deliverable}</span></p>}
              {o.skills && <div className="mt-3 flex flex-wrap gap-1.5">{o.skills.split("|").map((s) => <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{s}</span>)}</div>}
              {manager && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="mb-2 text-sm font-semibold">Applications ({apps.filter((a) => a.status === "pending").length} pending)</h3>
                  <Applicants rows={apps} />
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
