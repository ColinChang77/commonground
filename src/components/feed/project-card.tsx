import Link from "next/link";
import { Code2, Users } from "lucide-react";
import type { FeedProject } from "@/server/queries/feed";
import { categoryLabel } from "@/lib/constants";
import { ProjectStatusBadge } from "@/components/project-status";
import { UserAvatar } from "@/components/user-avatar";

export function ProjectCard({ p }: { p: FeedProject }) {
  return (
    <article className="relative rounded-2xl border bg-card p-4 transition-colors hover:border-ring/40 md:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ProjectStatusBadge status={p.status} />
        <span className="text-xs text-muted-foreground">{categoryLabel(p.category)}</span>
        {p.isSoftware ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Code2 className="size-3.5" aria-hidden /> Software
          </span>
        ) : null}
      </div>
      <h2 className="text-[1.05rem] font-semibold leading-snug">
        <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">{p.title}</Link>
      </h2>
      <p className="mt-1 text-[0.93rem] text-foreground/80">{p.summary}</p>
      <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <UserAvatar name={p.ownerName} avatarKey={p.ownerAvatar} size={20} /> {p.ownerName}
        </span>
        <span className="flex items-center gap-1"><Users className="size-3.5" aria-hidden /> {p.memberCount} {p.memberCount === 1 ? "member" : "members"}</span>
        {p.openRoles > 0 && <span className="font-medium text-primary">{p.openRoles} open {p.openRoles === 1 ? "role" : "roles"}</span>}
      </footer>
    </article>
  );
}
