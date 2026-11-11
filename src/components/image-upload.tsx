"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadImage } from "@/server/media";
import { Button } from "@/components/ui/button";

export function useImageUpload(purpose: "avatar" | "post") {
  const [pending, setPending] = useState(false);
  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Images can be at most 5 MB.");
      return null;
    }
    setPending(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("purpose", purpose);
    const res = await uploadImage(fd);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    return res.data.key;
  };
  return { upload, pending };
}

export function ImagePicker({ value, onChange, purpose = "post", label = "Add image" }: { value: string | null; onChange: (k: string | null) => void; purpose?: "avatar" | "post"; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, pending } = useImageUpload(purpose);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            const key = await upload(f);
            if (key) onChange(key);
          }
        }}
      />
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/media/${value}`} alt="Attached" className="max-h-56 rounded-xl border object-cover" />
          <button type="button" onClick={() => onChange(null)} aria-label="Remove image" className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => ref.current?.click()}>
          {pending ? <Loader2 className="animate-spin" /> : <ImagePlus />} {pending ? "Uploading…" : label}
        </Button>
      )}
    </div>
  );
}
