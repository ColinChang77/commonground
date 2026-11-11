"use client";
import { markNotificationsRead } from "@/server/notifications";
import { respondToInvitation } from "@/server/projects";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { useRouter } from "next/navigation";

export function MarkAllRead() {
  const { exec, pending } = useAction();
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => exec(() => markNotificationsRead("all"))}>Mark all as read</Button>;
}

export function NotificationLink({ id, url, unread, children }: { id: string; url: string; unread: boolean; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <a href={url} onClick={async (e) => { e.preventDefault(); if (unread) await markNotificationsRead([id]); router.push(url); }} className="flex gap-3 rounded-xl px-3 py-3 hover:bg-muted">
      {children}
    </a>
  );
}

export function InvitationButtons({ id }: { id: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={async () => { const r = await exec(() => respondToInvitation(id, true)); if (r.ok && r.data.slug) router.push(`/p/${r.data.slug}`); }}>Accept</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => respondToInvitation(id, false))}>Decline</Button>
    </div>
  );
}
