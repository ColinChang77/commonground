"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/form-field";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const invalid = params.get("error");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(invalid ? "This reset link is invalid or has expired." : null);
  const [pending, setPending] = useState(false);
  if (!token)
    return (
      <p className="text-sm">
        This reset link is invalid or has expired. <Link className="text-primary underline" href="/forgot-password">Request a new one</Link>.
      </p>
    );
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    setPending(false);
    if (error) return setError(error.message ?? "This reset link is invalid or has expired.");
    router.push("/sign-in?reset=1");
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label="New password" htmlFor="password" hint="At least 10 characters. You'll be signed out of other devices.">
        <Input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
      </Field>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>{pending ? "Saving…" : "Save new password"}</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
