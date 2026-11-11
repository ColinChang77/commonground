"use client";
import { withdrawApplication } from "@/server/collab";
import { useAction } from "@/components/use-action";

export function WithdrawButton({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return <button type="button" disabled={pending} className="text-xs underline-offset-2 hover:text-foreground hover:underline" onClick={() => exec(() => withdrawApplication(id))}>Withdraw</button>;
}
