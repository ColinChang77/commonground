"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FolderKanban, Home, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";

type Item = { href: string; label: string; icon: typeof Home; match: (p: string) => boolean; badge?: number };

export function useNavItems(profileHref: string, unread: number): Item[] {
  return [
    { href: "/", label: "Home", icon: Home, match: (p) => p === "/" || p.startsWith("/d/") || p.startsWith("/search") },
    { href: "/collaborate", label: "Projects", icon: FolderKanban, match: (p) => p.startsWith("/collaborate") || p.startsWith("/p/") },
    { href: "/create", label: "Post", icon: Plus, match: (p) => p.startsWith("/create") },
    { href: "/activity", label: "Notifications", icon: Bell, match: (p) => p.startsWith("/activity"), badge: unread },
    { href: profileHref, label: "Profile", icon: UserRound, match: (p) => p.startsWith("/u/") || p.startsWith("/settings") },
  ];
}

const row = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function SideNav({ profileHref, unread, joined }: { profileHref: string; unread: number; joined: string[] }) {
  const pathname = usePathname();
  const items = useNavItems(profileHref, unread).filter((i) => i.label !== "Post");
  const communities = [...CATEGORIES].sort((a, b) => Number(joined.includes(b.id)) - Number(joined.includes(a.id)));
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = it.match(pathname);
        return (
          <Link key={it.label} href={it.href} aria-current={active ? "page" : undefined} className={cn(row, active ? "bg-muted font-semibold text-foreground" : "text-foreground/80 hover:bg-muted/70")}>
            <it.icon className="size-5" aria-hidden />
            <span>{it.label}</span>
            {it.badge ? <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[0.68rem] font-bold leading-none text-primary-foreground tabular-nums">{it.badge > 99 ? "99+" : it.badge}<span className="sr-only"> unread</span></span> : null}
          </Link>
        );
      })}
      <div className="mt-4 border-t pt-4">
        <div className="mb-1 px-3 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Communities</div>
        {communities.map((c) => {
          const href = `/c/${c.id}`;
          const active = pathname === href;
          return (
            <Link key={c.id} href={href} aria-current={active ? "page" : undefined} className={cn(row, "py-1.5", active ? "bg-muted font-semibold" : "text-foreground/80 hover:bg-muted/70")}>
              <span className="text-base leading-none" aria-hidden>{c.emoji}</span>
              <span className="truncate">c/{c.label.replace(/\s+/g, "")}</span>
              {joined.includes(c.id) && <span className="ml-auto size-1.5 rounded-full bg-primary" aria-label="Joined" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNav({ profileHref, unread }: { profileHref: string; unread: number }) {
  const pathname = usePathname();
  const items = useNavItems(profileHref, unread);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((it) => {
          const active = it.match(pathname);
          const isCreate = it.label === "Post";
          return (
            <li key={it.label}>
              <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[0.68rem] outline-none focus-visible:bg-muted", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {isCreate ? <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><it.icon className="size-5" aria-hidden /></span> : <it.icon className={cn("size-[22px]", active && "stroke-[2.4]")} aria-hidden />}
                <span className={cn(isCreate && "sr-only")}>{it.label === "Notifications" ? "Alerts" : it.label}</span>
                {it.badge ? <span className="absolute right-[26%] top-2 size-2 rounded-full bg-primary" aria-label={`${it.badge} unread`} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
