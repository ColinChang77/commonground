import Link from "next/link";
import { getViewer } from "@/lib/session";
import { Button } from "@/components/ui/button";

export const metadata = { title: "How it works" };

const STEPS = [
  { emoji: "💡", title: "Share an idea", body: "Post something you'd like to make happen — a neighborhood tool library, a study group, an app. Pick a community like c/Education so the right people see it.", cta: "Create a post", href: "/create" },
  { emoji: "🗳️", title: "People vote and chat", body: "Others upvote ▲ ideas they like, comment with suggestions, and tap “I'd help” if they want in. You'll get a notification for each.", cta: "Browse what's hot", href: "/?sort=hot" },
  { emoji: "🎉", title: "Turn it into a project", body: "When people are interested, open your post and press “Turn into Project”. We fill in the details from your post. You add goals and the kinds of help you need. The original conversation stays attached.", cta: "See an example", href: "/p/block-tool-library" },
  { emoji: "🙋", title: "Find helpers", body: "Each kind of help becomes a “Help wanted” listing. People apply with a short message, and you accept the ones who fit. Accepted people join the project.", cta: "Projects looking for help", href: "/collaborate" },
  { emoji: "✅", title: "Hand out to-dos", body: "Break the work into to-dos and assign them. When someone finishes, they submit what they did and you approve it.", cta: null, href: null },
  { emoji: "🏅", title: "Everyone gets credit", body: "Approved work shows on the person's profile as verified work — with an honest label if AI helped. Credit comes from real contributions, not follower counts.", cta: "See a profile", href: "/u/hana" },
];

export default async function GuidePage() {
  const viewer = await getViewer();
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-6 md:py-10">
      <p className="text-sm font-semibold text-primary">How CommonGround works</p>
      <h1 className="mt-1 text-3xl font-bold leading-tight md:text-4xl">From a conversation to something real — in six steps.</h1>
      <p className="mt-3 text-muted-foreground">If you&apos;ve used Reddit, you already know half of it: communities, posts, votes and comments. CommonGround adds what happens next — turning a good idea into a project, finding helpers, and giving everyone credit.</p>
      <ol className="mt-8 flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <li key={s.title} id={i === 2 ? "projects" : undefined} className="flex gap-4 rounded-xl border bg-card p-4 md:p-5">
            <div className="flex flex-col items-center">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-accent text-2xl" aria-hidden>{s.emoji}</span>
              {i < STEPS.length - 1 && <span className="mt-2 w-px flex-1 bg-border" aria-hidden />}
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="text-lg font-bold"><span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>{s.title}</h2>
              <p className="mt-1 text-[0.95rem] text-foreground/80">{s.body}</p>
              {s.cta && s.href && <Link href={s.href} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">{s.cta} →</Link>}
            </div>
          </li>
        ))}
      </ol>
      <section className="mt-8 rounded-xl border bg-muted/40 p-5">
        <h2 className="font-bold">Building software? (optional)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Software projects get a “Code & AI” tab: link a GitHub repository, turn to-dos into GitHub issues, and let AI coding tools like Claude Code read the project and submit work — a person always approves before anything is published.</p>
      </section>
      <div className="mt-8 flex flex-wrap gap-2">
        {viewer?.profile ? <Button asChild className="rounded-full"><Link href="/create">Share your first idea</Link></Button> : <Button asChild className="rounded-full"><Link href="/sign-up">Join CommonGround</Link></Button>}
        <Button asChild variant="outline" className="rounded-full"><Link href="/">Explore posts</Link></Button>
      </div>
    </div>
  );
}
