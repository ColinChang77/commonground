import { mediaBucket } from "@/lib/env";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!/^u\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const bucket = mediaBucket();
  if (!bucket) return new Response("Not found", { status: 404 });
  const obj = await bucket.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const type = obj.httpMetadata?.contentType ?? "";
  if (!ALLOWED.has(type)) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ETag: obj.httpEtag,
    },
  });
}
