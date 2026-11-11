"use client";
import { useState } from "react";
import { teamUpdateBuild } from "@/server/build-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/use-action";

export function TeamBuildControls({ id, status }: { id: string; status: string }) {
  const { exec, pending } = useAction();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const go = (action: "start" | "review" | "live" | "cancel") => exec(() => teamUpdateBuild({ id, action, url, note: note || undefined }));
  return (
    <div className="mt-3 flex flex-col gap-2">
      {(status === "building" || status === "review") && (
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Preview or live link" placeholder="https://preview-link…" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-52 flex-1" />
          <Input aria-label="Note to requester" placeholder="Short note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-40 flex-1" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "requested" && <Button size="sm" disabled={pending} onClick={() => go("start")}>Start building</Button>}
        {status === "building" && <Button size="sm" disabled={pending || !url} onClick={() => go("review")}>Send for review</Button>}
        {status === "review" && <Button size="sm" variant="outline" disabled={pending} onClick={() => go("live")}>Mark live</Button>}
        {status !== "live" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => go("cancel")}>Cancel</Button>}
      </div>
    </div>
  );
}
