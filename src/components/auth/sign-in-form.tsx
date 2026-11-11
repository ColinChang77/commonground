"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/form-field";
import { toast } from "sonner";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setUnverified(false);
    const { error } = await authClient.signIn.email({ email, password, callbackURL: next });
    setPending(false);
    if (error) {
      if (error.status === 403 || error.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(true);
        setError("Please confirm your email first — we've sent you a fresh link.");
      } else if (error.status === 429) setError("Too many attempts. Wait a minute and try again.");
      else setError(error.message ?? "Email or password is incorrect.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function resend() {
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/onboarding" });
    if (error) toast.error(error.message ?? "Couldn't send the email.");
    else toast.success("Verification email sent.");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
      </Field>
      <div className="-mt-1 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Forgot password?
        </Link>
        {unverified && (
          <button type="button" onClick={resend} className="text-primary underline-offset-4 hover:underline">
            Resend email
          </button>
        )}
      </div>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
