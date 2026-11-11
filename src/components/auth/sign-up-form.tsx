"use client";
import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/form-field";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    if (!agree) return setError("Please accept the Terms and Community Guidelines.");
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/onboarding" });
    setPending(false);
    if (error) {
      setError(error.status === 429 ? "Too many sign-ups from this network. Try again later." : (error.message ?? "Couldn't create your account."));
      return;
    }
    setSent(true);
  }

  if (sent)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center" role="status">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{email}</strong>. Open it to finish setting up your profile.
        </p>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <Field label="Your name" htmlFor="name">
        <Input id="name" autoComplete="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
      </Field>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>
          I agree to the <Link href="/legal/terms" className="underline">Terms</Link>, <Link href="/legal/privacy" className="underline">Privacy Policy</Link> and{" "}
          <Link href="/legal/guidelines" className="underline">Community Guidelines</Link>.
        </span>
      </label>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
