import { category } from "@/lib/constants";
import { cn } from "@/lib/utils";

const BG: Record<string, string> = {
  technology: "bg-[oklch(0.9_0.06_245)]", art: "bg-[oklch(0.9_0.07_330)]", education: "bg-[oklch(0.92_0.07_85)]",
  business: "bg-[oklch(0.9_0.04_260)]", research: "bg-[oklch(0.9_0.06_200)]", community: "bg-[oklch(0.9_0.07_150)]",
  "social-impact": "bg-[oklch(0.9_0.08_130)]", events: "bg-[oklch(0.9_0.07_40)]", lifestyle: "bg-[oklch(0.9_0.05_60)]", other: "bg-muted",
};

export function CommunityIcon({ id, size = 24, className }: { id: string; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full", BG[id] ?? "bg-muted", className)} style={{ width: size, height: size, fontSize: size * 0.55 }}>
      {category(id).emoji}
    </span>
  );
}
