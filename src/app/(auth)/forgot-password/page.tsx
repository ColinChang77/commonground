"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/form-field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("pending");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error && error.status === 429) {
      setError("Too many requests. Try again later.");
      setState("idle");
      return;
    }
    // Same message whether or not the account exists (no account enumeration).
    setState("sent");
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">We&apos;ll email you a link to choose a new one.</p>
      {state === "sent" ? (
        <p role="status" className="rounded-xl border bg-card p-4 text-sm">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in one hour.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={error} />
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
          </Field>
          <Button type="submit" size="lg" className="h-10" disabled={state === "pending"}>
            {state === "pending" ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/sign-in" className="text-muted-foreground hover:text-foreground">Back to sign in</Link></p>
    </>
  );
}
