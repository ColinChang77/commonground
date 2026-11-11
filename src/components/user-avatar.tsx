import { cn } from "@/lib/utils";

export function mediaUrl(key: string | null | undefined) {
  return key ? `/media/${key}` : null;
}

const TONES = ["bg-[oklch(0.88_0.06_152)]", "bg-[oklch(0.88_0.07_75)]", "bg-[oklch(0.88_0.05_245)]", "bg-[oklch(0.88_0.06_30)]", "bg-[oklch(0.88_0.05_300)]"];

export function UserAvatar({
  name,
  avatarKey,
  size = 36,
  className,
}: {
  name: string;
  avatarKey?: string | null;
  size?: number;
  className?: string;
}) {
  const url = mediaUrl(avatarKey);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const tone = TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[oklch(0.3_0.03_70)] ring-1 ring-border", !url && tone, className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="font-medium">{initials || "?"}</span>
      )}
    </span>
  );
}
