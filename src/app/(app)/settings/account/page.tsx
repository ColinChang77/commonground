import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { account } from "@/db/schema";
import { requireViewer } from "@/lib/session";
import { enabledSocialProviders } from "@/lib/auth";
import { ChangePassword, DeleteAccount, LinkProvider, SignOutButton } from "@/components/settings/account-ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsSection } from "@/components/settings-section";

export const metadata = { title: "Account" };

export default async function AccountSettings() {
  const v = await requireViewer("/settings/account");
  const accounts = await getDb().select({ providerId: account.providerId, password: account.password }).from(account).where(eq(account.userId, v.id));
  const social = enabledSocialProviders();
  const hasPassword = accounts.some((a) => a.providerId === "credential" && a.password);
  return (
    <div className="flex flex-col gap-5">
      <SettingsSection title="Signed in as">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm">{v.email} {v.emailVerified ? <span className="text-success">· verified</span> : <span className="text-warning">· not verified</span>}</span><SignOutButton /></div>
      </SettingsSection>
      <SettingsSection title="Appearance"><ThemeToggle /></SettingsSection>
      {(social.github || social.google) && (
        <SettingsSection title="Connected sign-in accounts">
          <ul className="flex flex-col gap-3">
            {social.github && <li className="flex items-center justify-between text-sm"><span>GitHub <span className="block text-xs text-muted-foreground">Needed to install the GitHub App and link repositories.</span></span><LinkProvider provider="github" linked={accounts.some((a) => a.providerId === "github")} /></li>}
            {social.google && <li className="flex items-center justify-between text-sm"><span>Google</span><LinkProvider provider="google" linked={accounts.some((a) => a.providerId === "google")} /></li>}
          </ul>
        </SettingsSection>
      )}
      {hasPassword && <SettingsSection title="Password"><ChangePassword /></SettingsSection>}
      <SettingsSection title="Delete account"><DeleteAccount hasPassword={hasPassword} /></SettingsSection>
    </div>
  );
}
