import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type Step = { id: string; title: string; hint: string; href: string; done: boolean };

/** Real progress for the "Getting started" checklist, computed from the user's own data. */
export async function gettingStarted(userId: string): Promise<Step[]> {
  const [r] = await getDb().all<{ joined: number; voted: number; commented: number; posted: number; helping: number; inProject: number; converted: number }>(sql`
    SELECT
      (SELECT count(*) FROM user_interests WHERE user_id = ${userId}) AS joined,
      (SELECT count(*) FROM votes WHERE user_id = ${userId}) AS voted,
      (SELECT count(*) FROM comments WHERE author_id = ${userId}) AS commented,
      (SELECT count(*) FROM discussions WHERE author_id = ${userId} AND kind != 'update') AS posted,
      (SELECT count(*) FROM applications WHERE applicant_id = ${userId}) + (SELECT count(*) FROM reactions WHERE user_id = ${userId} AND kind = 'helping') AS helping,
      (SELECT count(*) FROM project_members WHERE user_id = ${userId}) AS inProject,
      (SELECT count(*) FROM discussions WHERE author_id = ${userId} AND converted_project_id IS NOT NULL) AS converted`);
  return [
    { id: "join", title: "Join a few communities", hint: "Pick topics you care about — they shape your Home feed.", href: "/c/community", done: r.joined > 0 },
    { id: "vote", title: "Upvote a post you like", hint: "Tap ▲ on any post. Good ideas rise to the top.", href: "/?sort=hot", done: r.voted > 0 },
    { id: "comment", title: "Leave a comment", hint: "Ask a question or offer an idea on someone's post.", href: "/?sort=new", done: r.commented > 0 },
    { id: "post", title: "Share your own idea", hint: "Something you'd like to make happen — big or small.", href: "/create", done: r.posted > 0 },
    { id: "help", title: "Offer to help a project", hint: "Tap “I'd help” on a post, or apply to a role in Projects.", href: "/collaborate", done: r.helping > 0 },
    { id: "project", title: "Turn an idea into a project", hint: "When people join in, open your post and press “Turn into Project”.", href: "/guide#projects", done: r.converted > 0 || r.inProject > 0 },
  ];
}
