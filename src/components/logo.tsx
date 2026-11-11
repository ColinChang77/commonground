import Link from "next/link";
import { cn } from "@/lib/utils";

/** Two overlapping circles meeting on shared ground. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <circle cx="12" cy="14" r="8" className="fill-primary/25" />
      <circle cx="20" cy="14" r="8" className="fill-primary/25" />
      <path d="M16 7.1a8 8 0 0 1 0 13.8 8 8 0 0 1 0-13.8Z" className="fill-primary" />
      <rect x="4" y="25" width="24" height="3" rx="1.5" className="fill-foreground/80" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 rounded-lg font-heading text-lg font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>CommonGround</span>
    </Link>
  );
}
