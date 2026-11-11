"use client";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toggleBlock, toggleFollow } from "@/server/profile";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ReportDialog } from "@/components/report-dialog";
import { useAction } from "@/components/use-action";

export function ProfileActions({ userId, following, blocked }: { userId: string; following: boolean; blocked: boolean }) {
  const { exec, pending } = useAction();
  const [report, setReport] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {!blocked && <Button variant={following ? "outline" : "default"} disabled={pending} onClick={() => exec(() => toggleFollow(userId))}>{following ? "Following" : "Follow"}</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="More" className="inline-flex size-9 items-center justify-center rounded-lg border hover:bg-muted"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => exec(() => toggleBlock(userId))}>{blocked ? "Unblock" : "Block"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setReport(true)}>Report</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog open={report} onOpenChange={setReport} targetType="user" targetId={userId} />
    </div>
  );
}
