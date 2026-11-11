"use client";
import { useState } from "react";
import { postProjectUpdate } from "@/server/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useAction } from "@/components/use-action";

export function UpdateForm({ projectId, isPublic }: { projectId: string; isPublic: boolean }) {
  const { exec, pending } = useAction();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isMilestone, setMilestone] = useState(false);
  const [shareToFeed, setShare] = useState(isPublic);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <Input aria-label="Update title" placeholder="What happened? e.g. First 20 tools donated!" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
      <MarkdownEditor value={body} onChange={setBody} rows={4} ariaLabel="Update details" placeholder="Details, photos, thanks to contributors…" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><Switch checked={isMilestone} onCheckedChange={setMilestone} aria-label="Milestone" /> Milestone</label>
        {isPublic && <label className="flex items-center gap-2"><Switch checked={shareToFeed} onCheckedChange={setShare} aria-label="Share to Explore" /> Share to Explore feed</label>}
        <Button
          className="ml-auto"
          disabled={pending || title.trim().length < 4}
          onClick={async () => {
            const r = await exec(() => postProjectUpdate({ projectId, title, body, isMilestone, shareToFeed }));
            if (r.ok) {
              setTitle("");
              setBody("");
              setMilestone(false);
            }
          }}
        >
          {pending ? "Publishing…" : "Publish update"}
        </Button>
      </div>
    </div>
  );
}
