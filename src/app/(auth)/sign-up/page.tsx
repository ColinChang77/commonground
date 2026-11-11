import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { SocialButtons } from "@/components/auth/social-buttons";
import { emailReady, enabledSocialProviders } from "@/lib/auth";
import { getViewer } from "@/lib/session";

export const metadata = { title: "Join" };

export default async function SignUpPage() {
  if (await getViewer()) redirect("/");
  const social = enabledSocialProviders();
  // Email sign-up needs a mail provider; until then, OAuth providers (which verify email themselves) can still open sign-up.
  if (!emailReady() && (social.google || social.github))
    return (
      <>
        <h1 className="text-2xl font-semibold">Turn ideas into something real</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">Join a community of people who build things together.</p>
        <SocialButtons {...social} callbackURL="/" divider={false} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account? <Link href="/sign-in" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </>
    );
  if (!emailReady())
    return (
      <div role="status" className="rounded-2xl border bg-card p-6">
        <h1 className="text-xl font-semibold">CommonGround is in private beta</h1>
        <p className="mt-2 text-sm text-muted-foreground">New sign-ups open soon. If you already have an account, <Link href="/sign-in" className="font-medium text-primary hover:underline">sign in</Link>.</p>
      </div>
    );
  return (
    <>
      <h1 className="text-2xl font-semibold">Turn ideas into something real</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Join a community of people who build things together.</p>
      <SocialButtons {...social} callbackURL="/" />
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/sign-in" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </>
  );
}
