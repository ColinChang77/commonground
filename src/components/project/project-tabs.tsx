"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTabs({ slug, tabs }: { slug: string; tabs: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Project sections" className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((t) => {
          const full = `/p/${slug}${t.href}`;
          const active = t.href === "" ? pathname === full : pathname.startsWith(full);
          return (
            <li key={t.label}>
              <Link href={full} aria-current={active ? "page" : undefined} className={cn("relative inline-flex h-10 items-center gap-1.5 px-3 text-sm transition-colors", active ? "font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
                {t.badge ? <span className="rounded-full bg-primary/15 px-1.5 text-[0.68rem] font-semibold text-primary tabular-nums">{t.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
