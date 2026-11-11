"use server";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { activeViewer, ActionError, type ActionResult, ok, run } from "@/lib/action";
import { getViewer } from "@/lib/session";
import { mediaBucket } from "@/lib/env";
import { newId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { sniffImage, MAX_IMAGE_BYTES } from "@/lib/image-sniff";

/**
 * Uploads an image to R2. Validates by magic bytes (never trusts the client-provided type),
 * caps size, and rate-limits per user. Avatar uploads are allowed before onboarding completes.
 */
export async function uploadImage(form: FormData): Promise<ActionResult<{ key: string; url: string }>> {
  return run(async () => {
    const bucket = mediaBucket();
    if (!bucket) throw new ActionError("Image uploads aren't available yet on this site.");
    const purpose = form.get("purpose") === "avatar" ? "avatar" : "post";
    let userId: string;
    if (purpose === "avatar") {
      const v = await getViewer();
      if (!v) throw new ActionError("Please sign in first.");
      if (!(await rateLimit(`upload:${v.id}`, 10, 300))) throw new ActionError("Too many uploads. Try again in a few minutes.");
      userId = v.id;
    } else {
      userId = (await activeViewer("upload", 10, 300)).id;
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ActionError("Choose an image to upload.");
    if (file.size === 0) throw new ActionError("That file is empty.");
    if (file.size > MAX_IMAGE_BYTES) throw new ActionError("Images can be at most 5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) throw new ActionError("Only PNG, JPEG, GIF or WebP images are supported.");
    const key = `u/${userId}/${newId()}.${kind.ext}`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: kind.mime, cacheControl: "public, max-age=31536000, immutable" } });
    await getDb().insert(media).values({ id: newId(), ownerId: userId, key, contentType: kind.mime, size: file.size });
    return ok({ key, url: `/media/${key}` });
  });
}
