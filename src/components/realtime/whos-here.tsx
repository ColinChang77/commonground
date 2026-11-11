"use client";
import { useRoom } from "@/components/realtime/room-provider";
import { UserAvatar } from "@/components/user-avatar";

/** "Here now" panel: who is in the project and what they're doing — from live presence only. */
export function WhosHere() {
  const { status, users, selfId } = useRoom();
  if (status === "disabled") return null;
  return (
    <section aria-labelledby="here-h" className="rounded-xl border bg-card p-4">
      <h2 id="here-h" className="mb-2 flex items-center gap-2 text-sm font-bold"><span className={`size-2 rounded-full ${status === "live" ? "bg-success" : "bg-muted-foreground"}`} aria-hidden /> Here now</h2>
      {status !== "live" ? (
        <p className="text-sm text-muted-foreground">{status === "connecting" ? "Connecting…" : "Can't reach live updates right now — reconnecting."}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {users.map((u) => (
            <li key={u.uid} className="flex items-center gap-2.5 animate-in fade-in slide-in-from-left-1 duration-300 motion-reduce:animate-none">
              <UserAvatar name={u.name} avatarKey={u.avatar} size={28} />
              <span className="min-w-0 text-sm leading-tight"><span className="font-semibold">{u.uid === selfId ? "You" : u.name}</span><span className="block truncate text-xs text-muted-foreground">{u.focus ?? "Here"}</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
