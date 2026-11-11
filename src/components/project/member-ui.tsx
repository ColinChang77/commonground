"use client";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { changeMemberRole, inviteMember, removeMember } from "@/server/projects";
import { logContribution, verifyContribution } from "@/server/tasks";
import { AUTHORSHIP, CONTRIBUTION_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction } from "@/components/use-action";

export function MemberMenu({ projectId, userId, role, viewerRole }: { projectId: string; userId: string; role: string; viewerRole: string }) {
  const { exec } = useAction();
  const roles = viewerRole === "owner" ? ["admin", "contributor", "viewer"] : ["contributor", "viewer"];
  if (role === "owner" || (viewerRole === "admin" && role === "admin")) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Manage member" className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {roles.filter((r) => r !== role).map((r) => <DropdownMenuItem key={r} onSelect={() => exec(() => changeMemberRole(projectId, userId, r))}>Make {r}</DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => exec(() => removeMember(projectId, userId))}>Remove from project</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InviteForm({ projectId, canInviteAdmin }: { projectId: string; canInviteAdmin: boolean }) {
  const { exec, pending } = useAction();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("contributor");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await exec(() => inviteMember(projectId, username, role)); if (r.ok) setUsername(""); }}>
      <Input aria-label="Username to invite" placeholder="@username" value={username} onChange={(e) => setUsername(e.target.value)} className="min-w-0 flex-1" />
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger aria-label="Role" className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{(canInviteAdmin ? ["admin", "contributor", "viewer"] : ["contributor", "viewer"]).map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="submit" disabled={pending || username.trim().length < 3}>Invite</Button>
    </form>
  );
}

export function VerifyButtons({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return (
    <div className="flex gap-1.5">
      <Button size="sm" disabled={pending} onClick={() => exec(() => verifyContribution(id, "verified"))}>Verify</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => verifyContribution(id, "rejected"))}>Decline</Button>
    </div>
  );
}

export function LogContribution({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { exec, pending } = useAction();
  const [f, setF] = useState({ type: "research", title: "", description: "", authorship: "human", agentLabel: "" });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Log a contribution</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log a contribution</DialogTitle><DialogDescription>For work that wasn&apos;t a task — research, organizing, feedback. A project admin verifies it.</DialogDescription></DialogHeader>
          <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
            <SelectTrigger aria-label="Type" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{CONTRIBUTION_TYPES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input aria-label="Title" placeholder="What did you contribute?" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Textarea aria-label="Details" rows={3} placeholder="Details or links" value={f.description} maxLength={3000} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <Select value={f.authorship} onValueChange={(v) => setF({ ...f, authorship: v })}>
            <SelectTrigger aria-label="Authorship" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{AUTHORSHIP.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
          {f.authorship !== "human" && <Input aria-label="AI tool" placeholder="Which AI tool?" value={f.agentLabel} onChange={(e) => setF({ ...f, agentLabel: e.target.value })} />}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || f.title.trim().length < 4} onClick={async () => { const r = await exec(() => logContribution({ projectId, ...f, agentLabel: f.agentLabel || undefined })); if (r.ok) setOpen(false); }}>Log it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
