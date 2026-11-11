"use client";
import { useState } from "react";
import { decideApproval } from "@/server/agents";
import { createRepositoryForProject, linkRepository, listInstallationRepositories, unlinkRepository } from "@/server/github";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import { toast } from "sonner";

export function ApprovalButtons({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => exec(() => decideApproval(id, "approved"))}>Approve</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => decideApproval(id, "rejected"))}>Reject</Button>
    </div>
  );
}

export function RepoPicker({ projectId, installations }: { projectId: string; installations: { id: string; accountLogin: string; accountType: string }[] }) {
  const { exec, pending } = useAction();
  const [inst, setInst] = useState(installations[0]?.id ?? "");
  const [repos, setRepos] = useState<{ id: number; full_name: string; private: boolean }[] | null>(null);
  const [repoId, setRepoId] = useState("");
  const [newName, setNewName] = useState("");
  const current = installations.find((i) => i.id === inst);
  async function load(id: string) {
    setInst(id);
    setRepos(null);
    const r = await listInstallationRepositories(id);
    if (!r.ok) toast.error(r.error);
    else setRepos(r.data.repos);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Select value={inst} onValueChange={load}>
          <SelectTrigger aria-label="GitHub account" className="w-52"><SelectValue placeholder="GitHub account" /></SelectTrigger>
          <SelectContent>{installations.map((i) => <SelectItem key={i.id} value={i.id}>{i.accountLogin}</SelectItem>)}</SelectContent>
        </Select>
        {repos === null ? (
          <Button variant="outline" disabled={!inst} onClick={() => load(inst)}>Load repositories</Button>
        ) : (
          <>
            <Select value={repoId} onValueChange={setRepoId}>
              <SelectTrigger aria-label="Repository" className="min-w-56 flex-1"><SelectValue placeholder={repos.length ? "Choose a repository" : "No repositories shared with the app"} /></SelectTrigger>
              <SelectContent>{repos.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.full_name}{r.private ? " (private)" : ""}</SelectItem>)}</SelectContent>
            </Select>
            <Button disabled={!repoId || pending} onClick={() => exec(() => linkRepository(projectId, inst, Number(repoId)))}>Link</Button>
          </>
        )}
      </div>
      {current?.accountType === "Organization" && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Input aria-label="New repository name" placeholder={`New repo in ${current.accountLogin}`} value={newName} onChange={(e) => setNewName(e.target.value)} className="min-w-48 flex-1" />
          <Button variant="outline" disabled={!newName || pending} onClick={() => exec(() => createRepositoryForProject(projectId, inst, newName, true))}>Create private repo</Button>
        </div>
      )}
    </div>
  );
}

export function UnlinkRepo({ projectId }: { projectId: string }) {
  const { exec, pending } = useAction();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => unlinkRepository(projectId))}>Unlink</Button>;
}
