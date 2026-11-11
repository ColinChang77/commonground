/**
 * Minimal, safe Markdown → HTML for user content.
 * Everything is HTML-escaped first; only a fixed set of constructs is re-introduced,
 * links are restricted to http(s)/mailto, and every link gets rel="nofollow ugc noopener".
 * Supported: paragraphs, ### headings, > quotes, - / 1. lists, ``` fences, `code`, **bold**, *italic*,
 * [text](url), bare URLs, @mentions.
 */
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

function safeUrl(raw: string): string | null {
  const url = raw.replace(/&amp;/g, "&").trim();
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") return escapeHtml(u.toString());
  } catch {
    /* invalid */
  }
  return null;
}

function inline(s: string): string {
  // s is already escaped. Protect inline code first.
  const codes: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g, (m, text, href) => {
    const u = safeUrl(href);
    return u ? `<a href="${u}" rel="nofollow ugc noopener" target="_blank">${text}</a>` : text;
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]{3,2000})/g, (m, pre, href) => {
    const u = safeUrl(href);
    return u ? `${pre}<a href="${u}" rel="nofollow ugc noopener" target="_blank">${href}</a>` : m;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w@/&])@([a-zA-Z0-9_]{3,30})\b/g, '$1<a href="/u/$2">@$2</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

export function renderMarkdown(src: string): string {
  const lines = escapeHtml(src.replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      out.push(`<h3>${inline(line.replace(/^#{1,3}\s+/, ""))}</h3>`);
      i++;
      continue;
    }
    if (/^&gt;\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) buf.push(inline(lines[i++].replace(/^&gt;\s?/, "")));
      out.push(`<blockquote>${buf.join("<br/>")}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ""))}</li>`);
      out.push(`<ul>${buf.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
      out.push(`<ol>${buf.join("")}</ol>`);
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(```|#{1,3}\s|&gt;|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i])) buf.push(inline(lines[i++]));
    out.push(`<p>${buf.join("<br/>")}</p>`);
  }
  return out.join("");
}

/** Plain-text excerpt for cards / notifications. */
export function excerpt(src: string, max = 220): string {
  const t = src
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
