import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Bot, Megaphone } from "lucide-react";
import { getDb } from "@/db";
import { profiles, projectUpdates } from "@/db/schema";
import { loadProject } from "@/server/queries/project";
import { Markdown } from "@/components/markdown";
import { TimeAgo } from "@/components/time-ago";
import { UserAvatar } from "@/components/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { UpdateForm } from "@/components/project/update-form";

export default async function ProjectUpdates({ params }: { params: Promise<{ slug: string }> }) {
  const data = await loadProject((await params).slug);
  if (!data) notFound();
  const { project, access } = data;
  const rows = await getDb()
    .select({ u: projectUpdates, username: profiles.username, displayName: profiles.displayName, avatarKey: profiles.avatarKey })
    .from(projectUpdates)
    .innerJoin(profiles, eq(profiles.userId, projectUpdates.authorId))
    .where(and(eq(projectUpdates.projectId, project.id), eq(projectUpdates.status, "published")))
    .orderBy(desc(projectUpdates.createdAt))
    .limit(50);
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      {access.can("update.post") && <UpdateForm projectId={project.id} isPublic={project.visibility === "public"} />}
      {rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="No updates yet">Milestones and progress posts appear here — a public record of what this project has achieved.</EmptyState>
      ) : (
        <ol className="relative flex flex-col gap-6 border-l-2 pl-6">
          {rows.map(({ u, username, displayName, avatarKey }) => (
            <li key={u.id} className="relative">
              <span className={`absolute -left-[31px] top-1.5 size-3 rounded-full ring-4 ring-background ${u.isMilestone ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden />
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {u.isMilestone && <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">Milestone</span>}
                {u.source === "agent" && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Bot className="size-3" /> Drafted by an AI agent, approved by a human</span>}
                <TimeAgo date={u.createdAt} />
              </div>
              <h3 className="text-lg font-semibold">{u.title}</h3>
              {u.body && <Markdown source={u.body} className="mt-1" />}
              <Link href={`/u/${username}`} className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><UserAvatar name={displayName} avatarKey={avatarKey} size={20} /> {displayName}</Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
