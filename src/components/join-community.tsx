"use client";
import { toggleCommunity } from "@/server/discussions";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { useRouter } from "next/navigation";

export function JoinCommunity({ id, joined, signedIn, size = "default" }: { id: string; joined: boolean; signedIn: boolean; size?: "default" | "sm" }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <Button size={size} className="rounded-full px-4" variant={joined ? "outline" : "default"} disabled={pending} onClick={() => (signedIn ? exec(() => toggleCommunity(id)) : router.push(`/sign-in?next=/c/${id}`))}>
      {joined ? "Joined" : "Join"}
    </Button>
  );
}
