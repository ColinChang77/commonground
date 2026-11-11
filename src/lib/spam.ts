/** Cheap heuristics that catch the most common link-spam and copy-paste floods. */
export function looksLikeSpam(text: string): boolean {
  const links = text.match(/https?:\/\//g)?.length ?? 0;
  if (links > 8) return true;
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (words.length >= 30) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    const top = Math.max(...counts.values());
    if (top / words.length > 0.35) return true;
  }
  return /(.)\1{40,}/.test(text);
}
