"use client";
import { GitBranch } from "lucide-react";
import { syncTaskToIssue } from "@/server/github";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";

export function IssueSyncButton({ taskId, repo }: { taskId: string; repo: string }) {
  const { exec, pending } = useAction();
  return (
    <Button size="sm" variant="outline" className="self-start" disabled={pending} onClick={() => exec(() => syncTaskToIssue(taskId))}>
      <GitBranch /> {pending ? "Creating issue…" : `Create GitHub issue in ${repo}`}
    </Button>
  );
}
