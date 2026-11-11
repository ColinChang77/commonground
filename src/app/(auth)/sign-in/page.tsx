import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SocialButtons } from "@/components/auth/social-buttons";
import { enabledSocialProviders } from "@/lib/auth";
import { getViewer } from "@/lib/session";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getViewer()) redirect(next);
  const social = enabledSocialProviders();
  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in to keep building with your collaborators.</p>
      <SocialButtons {...social} callbackURL={next} />
      <SignInForm next={next} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here? <Link href="/sign-up" className="font-medium text-primary hover:underline">Create an account</Link>
      </p>
    </>
  );
}
