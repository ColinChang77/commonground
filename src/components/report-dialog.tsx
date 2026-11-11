"use client";
import { useState } from "react";
import { toast } from "sonner";
import { submitReport } from "@/server/moderation";
import { REPORT_REASONS } from "@/lib/constants";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  targetType: "discussion" | "comment" | "project" | "user" | "opportunity";
  targetId: string;
}) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  async function send() {
    setPending(true);
    const res = await submitReport({ targetType, targetId, reason, details });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message);
    onOpenChange(false);
    setReason("");
    setDetails("");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {targetType}</DialogTitle>
          <DialogDescription>Reports are private. Moderators review them against the Community Guidelines.</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">Reason</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
              <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-[var(--primary)]" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <Textarea placeholder="Anything else moderators should know? (optional)" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} aria-label="Details" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={!reason || pending}>{pending ? "Sending…" : "Send report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
