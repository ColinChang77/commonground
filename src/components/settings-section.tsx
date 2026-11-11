import type { LucideIcon } from "lucide-react";

export function SettingsSection({ title, desc, icon: Icon, children }: { title: string; desc?: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">{Icon && <Icon className="size-4 text-primary" />} {title}</h2>
      {desc ? <p className="mb-4 mt-1 text-sm text-muted-foreground">{desc}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}
