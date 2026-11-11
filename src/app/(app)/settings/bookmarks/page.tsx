import { Bookmark } from "lucide-react";
import { requireViewer } from "@/lib/session";
import { getBookmarks } from "@/server/queries/feed";
import { PostCard } from "@/components/feed/post-card";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Saved" };

export default async function Bookmarks() {
  const v = await requireViewer("/settings/bookmarks");
  const { items } = await getBookmarks(v.id, 0);
  return items.length ? <div className="flex flex-col gap-3">{items.map((p) => <PostCard key={p.id} post={p} viewerId={v.id} />)}</div> : <EmptyState icon={Bookmark} title="Nothing saved yet">Tap the bookmark on any post to keep it here.</EmptyState>;
}
