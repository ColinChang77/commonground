import { describe, expect, it } from "vitest";
import { renderMarkdown, excerpt } from "@/lib/markdown";

describe("renderMarkdown (XSS safety)", () => {
  it("escapes raw HTML", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(1)</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });
  it("drops javascript: links", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("href");
    expect(html).toContain("click");
  });
  it("drops data: links and keeps https", () => {
    expect(renderMarkdown("[x](data:text/html,hi)")).not.toContain("href");
    expect(renderMarkdown("[x](https://example.com/a?b=1&c=2)")).toContain('href="https://example.com/a?b=1&amp;c=2"');
  });
  it("cannot break out of href attributes", () => {
    const html = renderMarkdown('[x](https://e.com/"onmouseover="alert(1))');
    expect(html).not.toMatch(/"\s*onmouseover=/);
  });
  it("adds ugc rel to links", () => {
    expect(renderMarkdown("see https://example.com")).toContain('rel="nofollow ugc noopener"');
  });
  it("renders formatting, lists, code and mentions", () => {
    const html = renderMarkdown("**bold** *it* `x<y`\n\n- a\n- b\n\n```\n<b>\n```\n\nhi @maria_k");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    expect(html).toContain("<code>x&lt;y</code>");
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(html).toContain("<pre><code>&lt;b&gt;</code></pre>");
    expect(html).toContain('<a href="/u/maria_k">@maria_k</a>');
  });
  it("does not treat emails as mentions", () => {
    expect(renderMarkdown("mail a@example.com")).not.toContain('/u/example');
  });
  it("excerpts", () => {
    expect(excerpt("**Hello** [world](https://x.y)")).toBe("Hello world");
    expect(excerpt("a".repeat(300), 10)).toHaveLength(10);
  });
});
