export function newId() {
  return crypto.randomUUID();
}

export function slugify(input: string, max = 48) {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "project";
}

export function shortSuffix() {
  return Math.random().toString(36).slice(2, 7);
}
