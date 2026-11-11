import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { interests, skills, userSkills } from "@/db/schema";
import { requireViewer } from "@/lib/session";
import { ProfileForm } from "@/components/onboarding-form";
import type { CategoryId } from "@/lib/constants";
import { parseJson } from "@/server/queries/project";

export const metadata = { title: "Profile settings" };

export default async function ProfileSettings() {
  const v = await requireViewer("/settings/profile");
  const db = getDb();
  const ints = await db.select({ c: interests.category }).from(interests).where(eq(interests.userId, v.id));
  const sk = await db.select({ name: skills.name }).from(userSkills).innerJoin(skills, eq(skills.id, userSkills.skillId)).where(eq(userSkills.userId, v.id));
  const prefs = parseJson<{ openTo?: string[]; hoursPerWeek?: number | null }>(v.profile.collabPrefs, {});
  return (
    <ProfileForm
      mode="edit"
      initial={{ username: v.profile.username, displayName: v.profile.displayName, bio: v.profile.bio, avatarKey: v.profile.avatarKey, interests: ints.map((i) => i.c as CategoryId), skills: sk.map((s) => s.name), openTo: prefs.openTo ?? [], hoursPerWeek: prefs.hoursPerWeek ?? undefined }}
    />
  );
}
