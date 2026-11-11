import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { SampleBadge } from "@/components/sample-badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Demo: from a post to a launched project" };

const POST = "5a000000-0000-4000-8000-000000000010";

export default async function DemoPage() {
  const [p] = await getDb().select({ slug: projects.slug }).from(projects).where(eq(projects.slug, "swap-night")).limit(1);
  const slug = p?.slug ?? "swap-night";
  const steps = [
    { who: "Alex", emoji: "💡", title: "Alex posts an idea", body: "Alex isn't technical. They post in c/Community: “A simple sign-up page for our clothes swap nights.”", href: `/d/${POST}`, cta: "Open Alex's post" },
    { who: "Maya & Ryan", emoji: "💬", title: "Maya and Ryan reply", body: "Maya offers to design it. Ryan taps “I'd help” and says he'll build it with an AI coding agent. The conversation is where the team forms.", href: `/d/${POST}#comments`, cta: "Read the replies" },
    { who: "Alex", emoji: "🎉", title: "The conversation becomes a project", body: "Alex presses “Turn into Project”. The post stays attached, the goals are filled in, and Maya and Ryan join in one click.", href: `/p/${slug}`, cta: "Open the project" },
    { who: "Maya", emoji: "🎨", title: "Maya shares the design", body: "Maya takes the design to-do, shares her mockups, and Alex approves them. It's credited on Maya's profile.", href: `/p/${slug}/tasks`, cta: "See the shared work" },
    { who: "Ryan", emoji: "🤖", title: "Ryan's AI agent builds it", body: "Ryan connects Claude Code. While it works, the whole team sees it live: “Ryan's AI agent is running tests (9 passed).” Logs and files are one click away for developers.", href: `/p/${slug}/build`, cta: "See the AI activity" },
    { who: "Alex", emoji: "✅", title: "Alex reviews the result", body: "Nothing goes out without a person. Alex checks the work and approves it — with a GitHub repo, this is where the pull request is reviewed and merged.", href: `/p/${slug}/contributors`, cta: "See who did what" },
    { who: "Everyone", emoji: "📣", title: "The outcome goes back to the feed", body: "Alex shares “Sign-ups are live 🎉”. It appears in the community feed — and the loop starts again.", href: `/p/${slug}/updates`, cta: "See the results" },
  ];
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-6 md:py-10">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">Demo walkthrough <SampleBadge /></div>
      <h1 className="mt-1 text-3xl font-bold leading-tight md:text-4xl">From “someone should build this” to “we launched it” — together.</h1>
      <p className="mt-3 text-muted-foreground">Follow Alex, Maya and Ryan through CommonGround. Every step below is a real page in the app with real records; the people and posts are sample content and labeled <SampleBadge />.</p>
      <ol className="mt-8 flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-xl border bg-card p-4 md:p-5">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-2xl" aria-hidden>{s.emoji}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {i + 1} · {s.who}</p>
              <h2 className="text-lg font-bold">{s.title}</h2>
              <p className="mt-1 text-[0.95rem] text-foreground/80">{s.body}</p>
              <Link href={s.href} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">{s.cta} →</Link>
            </div>
          </li>
        ))}
      </ol>
      <section className="mt-8 rounded-xl border bg-muted/40 p-5 text-sm">
        <h2 className="font-bold">Try the live multiplayer part</h2>
        <p className="mt-1 text-muted-foreground">Open any project in two browsers with two accounts: you&apos;ll see each other under “Here now”, what the other person is looking at, and every change appear without refreshing.</p>
      </section>
      <div className="mt-6 flex flex-wrap gap-2"><Button asChild className="rounded-full"><Link href={`/d/${POST}`}>Start the walkthrough</Link></Button><Button asChild variant="outline" className="rounded-full"><Link href="/guide">How it works</Link></Button></div>
    </div>
  );
}
