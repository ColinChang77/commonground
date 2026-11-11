"use client";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "light", icon: Sun, label: "Light" },
  { id: "dark", icon: Moon, label: "Dark" },
  { id: "system", icon: Monitor, label: "System" },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard next-themes hydration guard
  useEffect(() => setMounted(true), []);
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg border p-0.5", className)}>
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            onClick={() => setTheme(o.id)}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "bg-muted text-foreground",
            )}
          >
            <o.icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
