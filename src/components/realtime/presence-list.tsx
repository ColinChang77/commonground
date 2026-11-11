"use client";
import { UserAvatar } from "@/components/user-avatar";
import type { PresenceUser } from "@/components/realtime/room-provider";

export function AnimatePresenceList({ users }: { users: PresenceUser[] }) {
  return (
    <ul className="flex -space-x-2" aria-label="People here now">
      {users.slice(0, 6).map((u) => (
        <li key={u.uid} className="group relative animate-in fade-in zoom-in-75 duration-300 motion-reduce:animate-none">
          <span className="relative inline-block">
            <UserAvatar name={u.name} avatarKey={u.avatar} size={28} className="ring-2 ring-background" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-background" aria-hidden />
          </span>
          <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background group-hover:block">
            {u.name}{u.focus ? ` · ${u.focus}` : ""}
          </span>
          <span className="sr-only">{u.name}{u.focus ? `, ${u.focus}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
