"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";

export function SignOutButton() {
  const router = useRouter();
  return <Button variant="outline" onClick={async () => { await authClient.signOut(); router.push("/"); router.refresh(); }}>Sign out</Button>;
}

export function LinkProvider({ provider, linked }: { provider: "github" | "google"; linked: boolean }) {
  const label = provider === "github" ? "GitHub" : "Google";
  if (linked) return <span className="text-sm text-success">Connected</span>;
  return <Button size="sm" variant="outline" onClick={() => authClient.linkSocial({ provider, callbackURL: "/settings/account" })}>Connect {label}</Button>;
}

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault();
      if (next.length < 10) return toast.error("Use at least 10 characters.");
      setPending(true);
      const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      setPending(false);
      if (error) toast.error(error.message ?? "Couldn't change your password.");
      else { toast.success("Password changed. Other devices were signed out."); setCurrent(""); setNext(""); }
    }}>
      <Field label="Current password" htmlFor="cur"><Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="New password" htmlFor="new" hint="At least 10 characters."><Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <Button type="submit" className="self-start" disabled={pending || !current || !next}>Change password</Button>
    </form>
  );
}

export function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">This permanently deletes your profile, posts, comments, uploaded images, API keys and tokens. Projects you own that have other members must be transferred or archived first. This can&apos;t be undone.</p>
      {hasPassword && <Field label="Password" htmlFor="del-pw"><Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
      <Field label='Type "delete my account" to confirm' htmlFor="del-confirm"><Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      <Button variant="destructive" className="self-start" disabled={pending || confirm !== "delete my account" || (hasPassword && !password)} onClick={async () => {
        setPending(true);
        const { error } = await authClient.deleteUser(hasPassword ? { password } : {});
        setPending(false);
        if (error) { toast.error(error.message ?? "Couldn't delete your account. You may need to sign in again first."); return; }
        toast.success("Your account was deleted.");
        router.push("/");
        router.refresh();
      }}>Delete my account</Button>
    </div>
  );
}
