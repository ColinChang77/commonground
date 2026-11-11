import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground"><Compass className="size-6" /></span>
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that</h1>
      <p className="max-w-sm text-sm text-muted-foreground">It may have been removed, made private, or the link is wrong.</p>
      <Button asChild className="mt-2"><Link href="/">Back to Explore</Link></Button>
    </main>
  );
}
