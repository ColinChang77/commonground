import Link from "next/link";
import { eq } from "drizzle-orm";
import { Bell, HelpCircle, PlayCircle, Plus, Search, ShieldCheck } from "lucide-react";
import { getViewer, isStaff } from "@/lib/session";
import { getDb } from "@/db";
import { interests } from "@/db/schema";
import { unreadCount } from "@/lib/notify";
import { Logo, LogoMark } from "@/components/logo";
import { SideNav, BottomNav } from "@/components/shell/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const db = getDb();
  const unread = viewer ? await unreadCount(db, viewer.id) : 0;
  const joined = viewer ? (await db.select({ c: interests.category }).from(interests).where(eq(interests.userId, viewer.id))).map((r) => r.c) : [];
  const profileHref = viewer?.profile ? `/u/${viewer.profile.username}` : viewer ? "/onboarding" : "/sign-in";

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-3 md:px-5">
          <Logo className="hidden shrink-0 md:flex" />
          <Link href="/" aria-label="CommonGround home" className="md:hidden"><LogoMark className="size-7" /></Link>
          <form action="/search" role="search" className="mx-auto w-full max-w-xl">
            <label className="relative block">
              <span className="sr-only">Search CommonGround</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input name="q" placeholder="Search CommonGround" className="h-10 w-full rounded-full border bg-muted/60 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted focus:border-ring focus:bg-background focus:ring-3 focus:ring-ring/30" />
            </label>
          </form>
          <div className="flex shrink-0 items-center gap-1">
            {viewer?.profile ? (
              <>
                <Button asChild variant="ghost" className="hidden h-10 rounded-full px-3 md:inline-flex"><Link href="/create"><Plus className="size-5" /> Create</Link></Button>
                <Button asChild variant="ghost" size="icon" className="relative hidden size-10 rounded-full md:inline-flex" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
                  <Link href="/activity"><Bell className="size-5" />{unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-primary px-1 text-[0.6rem] font-bold leading-4 text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}</Link>
                </Button>
                <Link href={profileHref} aria-label="Your profile" className="ml-1 rounded-full"><UserAvatar name={viewer.profile.displayName} avatarKey={viewer.profile.avatarKey} size={34} /></Link>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" className="rounded-full"><Link href="/sign-in">Log in</Link></Button>
                <Button asChild className="hidden rounded-full sm:inline-flex"><Link href="/sign-up">Sign up</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1320px]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[248px] shrink-0 flex-col overflow-y-auto border-r px-3 py-4 md:flex">
          <SideNav profileHref={profileHref} unread={unread} joined={joined} />
          <div className="mt-auto flex flex-col gap-1 pt-6">
            <Link href="/guide" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><HelpCircle className="size-4" /> How it works</Link>
            <Link href="/demo" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><PlayCircle className="size-4" /> Demo walkthrough</Link>
            {isStaff(viewer) && <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><ShieldCheck className="size-4" /> Moderation</Link>}
            <div className="flex items-center justify-between px-3 pt-2">
              <ThemeToggle />
              <span className="text-[0.68rem] text-muted-foreground"><Link href="/legal/terms" className="hover:underline">Terms</Link> · <Link href="/legal/privacy" className="hover:underline">Privacy</Link></span>
            </div>
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 pb-24 md:pb-10">
          {viewer && !viewer.emailVerified && <div role="status" className="border-b bg-warning/15 px-4 py-2 text-center text-sm">Check your inbox to confirm <strong>{viewer.email}</strong> — you can browse now and post once it&apos;s confirmed.</div>}
          {viewer?.profile?.suspendedAt && <div role="alert" className="border-b bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">Your account is suspended. You can browse but not post or collaborate.</div>}
          {children}
        </main>
      </div>
      <BottomNav profileHref={profileHref} unread={unread} />
    </div>
  );
}

export function PageColumns({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex gap-6 px-3 py-4 md:px-6 md:py-6">
      <div className="min-w-0 flex-1">{children}</div>
      {aside && <aside className="hidden w-[312px] shrink-0 lg:block">{aside}</aside>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
