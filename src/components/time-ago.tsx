export function timeAgo(d: Date | number, now = Date.now()) {
  const t = typeof d === "number" ? d : d.getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString("en", { month: "short", day: "numeric", year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

export function TimeAgo({ date }: { date: Date | number }) {
  const iso = new Date(date).toISOString();
  return (
    <time dateTime={iso} title={new Date(date).toLocaleString("en")} className="tabular-nums">
      {timeAgo(date)}
    </time>
  );
}
