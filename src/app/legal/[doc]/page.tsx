import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, LEGAL_REVIEW_NOTICE } from "@/lib/legal";
import { Markdown } from "@/components/markdown";
import { Logo } from "@/components/logo";

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  return { title: LEGAL_DOCS[(await params).doc]?.title ?? "Not found" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const d = LEGAL_DOCS[(await params).doc];
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-[720px] px-5 py-8">
      <Logo />
      <main id="main" className="mt-10">
        <p role="note" className="mb-6 rounded-xl border border-warning/50 bg-warning/15 px-4 py-2 text-sm font-medium">{LEGAL_REVIEW_NOTICE}</p>
        <h1 className="text-3xl font-semibold">{d.title}</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">Last updated {d.updated}</p>
        <Markdown source={d.body} />
        <nav className="mt-10 flex gap-4 border-t pt-4 text-sm"><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/guidelines">Community Guidelines</Link><Link href="/">Back to CommonGround</Link></nav>
      </main>
    </div>
  );
}
