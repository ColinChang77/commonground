import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { ProfileForm } from "@/components/onboarding-form";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Set up your profile" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const v = await getViewer();
  if (!v) redirect("/sign-in?next=/onboarding");
  if (v.profile) redirect(next);
  const suggested = (v.name || v.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  return (
    <ProfileForm
      mode="onboarding"
      next={next}
      initial={{ username: suggested.length >= 3 ? suggested : "", displayName: v.name, bio: "", avatarKey: null, interests: [], skills: [], openTo: [] }}
    />
  );
}
