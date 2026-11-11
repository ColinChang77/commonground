import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

const DOT: Record<ProjectStatus, string> = {
  exploring: "bg-info",
  recruiting: "bg-warning",
  building: "bg-primary",
  completed: "bg-success",
  archived: "bg-muted-foreground",
};

export function ProjectStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = (status in DOT ? status : "exploring") as ProjectStatus;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.72rem] font-medium", className)}>
      <span className={cn("size-1.5 rounded-full", DOT[s])} aria-hidden />
      {PROJECT_STATUS_LABEL[s]}
    </span>
  );
}
