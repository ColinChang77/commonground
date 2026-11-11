import { Logo } from "@/components/logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-5 md:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 md:pt-14">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
      <footer className="flex justify-center gap-4 pb-6 text-xs text-muted-foreground">
        <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
        <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
        <Link href="/legal/guidelines" className="hover:text-foreground">Community Guidelines</Link>
      </footer>
    </div>
  );
}
