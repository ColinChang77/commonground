import { notFound } from "next/navigation";
import { loadProject, parseJson } from "@/server/queries/project";
import { ProjectSettingsForm } from "@/components/project/settings-form";

export default async function ProjectSettings({ params }: { params: Promise<{ slug: string }> }) {
  const data = await loadProject((await params).slug);
  if (!data) notFound();
  const { project, access, members, viewer } = data;
  if (!access.can("project.edit") || !viewer) notFound();
  return (
    <div className="mx-auto max-w-[720px]">
      <ProjectSettingsForm
        viewerId={viewer.id}
        isOwner={data.role === "owner"}
        members={members.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
        p={{
          id: project.id, title: project.title, summary: project.summary, description: project.description,
          goals: parseJson<string[]>(project.goals, [""]), outcomes: project.outcomes, category: project.category, status: project.status,
          visibility: project.visibility, isSoftware: project.isSoftware, openJoin: project.openJoin, tags: parseJson<string[]>(project.tags, []), links: parseJson(project.links, []),
        }}
      />
    </div>
  );
}
