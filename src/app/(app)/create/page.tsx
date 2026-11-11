import { requireViewer } from "@/lib/session";
import { Composer } from "@/components/create/composer";
import { PageHeader } from "@/components/shell/app-shell";
import { CATEGORIES } from "@/lib/constants";

export const metadata = { title: "Create" };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ type?: string; community?: string }> }) {
  await requireViewer("/create");
  const sp = await searchParams;
  const type = sp.type;
  const community = CATEGORIES.find((c) => c.id === sp.community)?.id;
  const kind = type === "project" || type === "discussion" ? type : "idea";
  return (
    <div className="mx-auto max-w-[720px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader title="Create a post" description="Start small. Share an idea or ask a question — if people want to help, you can turn it into a project later." />
      <Composer initialKind={kind} defaultCategory={community} />
    </div>
  );
}
