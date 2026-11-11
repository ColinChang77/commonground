"use client";
import { AnimatePresenceList } from "@/components/realtime/presence-list";
import { useRoom } from "@/components/realtime/room-provider";

export function PresenceBar() {
  const { status, users, selfId } = useRoom();
  if (status === "disabled") return null;
  const others = users.filter((u) => u.uid !== selfId);
  return (
    <div className="flex items-center gap-2 text-sm" aria-live="polite">
      <span className={`size-2 rounded-full ${status === "live" ? "bg-success" : status === "connecting" ? "bg-warning" : "bg-muted-foreground"}`} aria-hidden />
      {status !== "live" ? (
        <span className="text-muted-foreground">{status === "connecting" ? "Connecting…" : "Offline — reconnecting"}</span>
      ) : others.length === 0 ? (
        <span className="text-muted-foreground">Only you here right now</span>
      ) : (
        <>
          <AnimatePresenceList users={others} />
          <span className="text-muted-foreground">{others.length === 1 ? `${others[0].name.split(" ")[0]} is here` : `${others.length} others here`}</span>
        </>
      )}
    </div>
  );
}
