import Link from "next/link";
import { CATEGORIES, communityName, compensationLabel } from "@/lib/constants";
import { CommunityIcon } from "@/components/community-icon";
import { Button } from "@/components/ui/button";
import { JoinCommunity } from "@/components/join-community";

export function HelpWanted({ opps }: { opps: { id: string; title: string; compensation: string; projectTitle: string; projectSlug: string }[] }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-2 text-sm font-bold">🙋 Projects looking for help</h2>
      {opps.length ? (
        <ul className="flex flex-col">
          {opps.map((o) => (
            <li key={o.id}><Link href={`/p/${o.projectSlug}/opportunities#${o.id}`} className="-mx-2 block rounded-lg px-2 py-2 hover:bg-muted"><div className="text-sm font-semibold leading-snug">{o.title}</div><div className="text-xs text-muted-foreground">{o.projectTitle} · {compensationLabel(o.compensation)}</div></Link></li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No open roles yet.</p>}
      <Button asChild variant="outline" size="sm" className="mt-2 w-full rounded-full"><Link href="/collaborate">See all projects</Link></Button>
    </section>
  );
}

export function PopularCommunities({ stats, joined, signedIn }: { stats: { category: string; members: number }[]; joined: string[]; signedIn: boolean }) {
  const list = [...CATEGORIES].map((c) => ({ ...c, members: stats.find((s) => s.category === c.id)?.members ?? 0 })).sort((a, b) => b.members - a.members).slice(0, 5);
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-2 text-sm font-bold">Popular communities</h2>
      <ul className="flex flex-col gap-1">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-2.5 py-1">
            <CommunityIcon id={c.id} size={32} />
            <Link href={`/c/${c.id}`} className="min-w-0 flex-1 leading-tight hover:underline"><span className="block truncate text-sm font-semibold">{communityName(c.id)}</span><span className="text-xs text-muted-foreground">{c.members} {c.members === 1 ? "member" : "members"}</span></Link>
            <JoinCommunity id={c.id} joined={joined.includes(c.id)} signedIn={signedIn} size="sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}
