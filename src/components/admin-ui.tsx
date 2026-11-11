"use client";
import { moderate } from "@/server/moderation";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";

export function ModerationButtons({ reportId, targetType, targetId, authorId }: { reportId: string; targetType: string; targetId: string; authorId: string | null }) {
  const { exec, pending } = useAction();
  const go = (action: string, t = targetType, id = targetId) => exec(() => moderate({ reportId, targetType: t, targetId: id, action, reason: "Community Guidelines" }));
  return (
    <div className="flex flex-wrap gap-2">
      {targetType !== "user" && <Button size="sm" variant="destructive" disabled={pending} onClick={() => go("remove")}>Remove content</Button>}
      {(targetType === "user" || authorId) && <Button size="sm" variant="outline" disabled={pending} onClick={() => go("suspend", "user", targetType === "user" ? targetId : authorId!)}>Suspend {targetType === "user" ? "account" : "author"}</Button>}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => go("dismiss")}>Dismiss</Button>
    </div>
  );
}

export function UnsuspendButton({ userId }: { userId: string }) {
  const { exec, pending } = useAction();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => moderate({ targetType: "user", targetId: userId, action: "unsuspend" }))}>Unsuspend</Button>;
}
