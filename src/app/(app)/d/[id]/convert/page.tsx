import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireViewer } from "@/lib/session";
import { getDiscussion, discussionParticipantCount } from "@/server/queries/discussion";
import { ProjectWizard } from "@/components/create/project-wizard";
import type { CategoryId } from "@/lib/constants";

export const metadata = { title: "Turn into Project" };

export default async function ConvertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/d/${id}/convert`);
  const data = await getDiscussion(id, viewer.id);
  if (!data) notFound();
  const { d } = data;
  if (d.authorId !== viewer.id) notFound();
  if (d.convertedProjectId && data.meta.convertedSlug) redirect(`/p/${data.meta.convertedSlug}`);
  const participants = await discussionParticipantCount(id);
  return (
    <div className="mx-auto max-w-[720px] px-4 py-5 md:px-8 md:py-8">
      <Link href={`/d/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to discussion</Link>
      <h1 className="text-2xl font-semibold">Turn into a project</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">We&apos;ve filled in what we could from “{d.title}”. Nothing changes until you confirm on the last step.</p>
      <ProjectWizard seed={{ sourceDiscussionId: d.id, sourceTitle: d.title, title: d.title, description: d.body, category: d.category as CategoryId, participantCount: participants }} />
    </div>
  );
}
