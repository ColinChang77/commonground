"use client";
import Link from "next/link";
import { useRoom } from "@/components/realtime/room-provider";
import type { ActivityItem } from "@/lib/realtime";
import { UserAvatar } from "@/components/user-avatar";
import { TimeAgo } from "@/components/time-ago";

const ICON: Record<string, string> = { joined: "👋", task_claimed: "🙋", task_started: "🛠️", task_submitted: "📤", task_done: "✅", task_created: "📝", update: "📣", milestone: "🏁", comment: "💬", agent: "🤖", github: "🔀", build: "🌐", help: "🤝" };

/** "What's happening": persisted history from the server + new events pushed live over the room socket. */
export function LiveActivity({ initial, limit = 12 }: { initial: ActivityItem[]; limit?: number }) {
  const { live } = useRoom();
  const seen = new Set<string>();
  const items = [...live, ...initial].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))).slice(0, limit);
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing yet — the first thing anyone does here will show up live.</p>;
  return (
    <ol className="flex flex-col" aria-live="polite">
      {items.map((i) => {
        const body = (
          <>
            {i.actorName ? <UserAvatar name={i.actorName} avatarKey={i.actorAvatar} size={28} /> : <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm" aria-hidden>{ICON[i.kind] ?? "•"}</span>}
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug">{i.message}</span>
              <span className="text-xs text-muted-foreground"><TimeAgo date={i.createdAt} /></span>
            </span>
          </>
        );
        return (
          <li key={i.id} className={live.some((l) => l.id === i.id) ? "animate-in fade-in slide-in-from-top-1 duration-500 motion-reduce:animate-none" : ""}>
            {i.url ? <Link href={i.url} className="-mx-2 flex gap-2.5 rounded-lg px-2 py-2 hover:bg-muted">{body}</Link> : <div className="flex gap-2.5 py-2">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}
