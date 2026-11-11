"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/account", label: "Account" },
  { href: "/settings/agents", label: "AI tools (advanced)" },
  { href: "/settings/bookmarks", label: "Saved" },
];

export function SettingsNav() {
  const p = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {TABS.map((t) => {
          const active = p.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("relative inline-flex h-10 items-center px-3 text-sm", active ? "font-semibold after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground")}>{t.label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
