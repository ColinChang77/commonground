import { requireViewer } from "@/lib/session";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireViewer("/settings");
  return (
    <div className="mx-auto max-w-[820px] px-4 py-5 md:px-8 md:py-8">
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      <SettingsNav />
      <div className="pt-6">{children}</div>
    </div>
  );
}

