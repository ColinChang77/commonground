// Demo data for presentations. All demo accounts use @demo.commonground.app emails and cannot sign in.
// Usage: node scripts/seed-demo.mjs <your-user-id> > /tmp/seed.sql && npx wrangler d1 execute commonground --remote --file /tmp/seed.sql
// Remove later: npx wrangler d1 execute commonground --remote --file scripts/remove-demo.sql
import { randomUUID } from "node:crypto";

const ME = process.argv[2];
if (!ME) { console.error("usage: node scripts/seed-demo.mjs <your-user-id>"); process.exit(1); }
const q = (s) => (s === null || s === undefined ? "NULL" : typeof s === "number" ? String(s) : `'${String(s).replace(/'/g, "''")}'`);
const out = [];
const ins = (table, row) => out.push(`INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(q).join(",")});`);
const NOW = Date.now();
const H = 3600_000, D = 24 * H;
const ago = (ms) => NOW - ms;
const id = () => randomUUID();

// ---------- people ----------
const people = [
  ["maya", "Maya Lin", "Product designer. I sketch first, then code a little.", ["design", "art", "technology"], ["UI design", "Figma", "Illustration"]],
  ["daniel", "Daniel Okafor", "Backend dev by day, community garden volunteer by weekend.", ["technology", "community"], ["Python", "PostgreSQL", "APIs"]],
  ["sofia", "Sofia Reyes", "High-school chemistry teacher. Always looking for better ways to explain things.", ["education", "research"], ["Teaching", "Curriculum design", "Chemistry"]],
  ["kenji", "Kenji Watanabe", "Indie game dev & pixel artist.", ["art", "technology", "lifestyle"], ["Pixel art", "Unity", "Game design"]],
  ["amara", "Amara Singh", "Running a small nonprofit for refugee families. Grant writing veteran.", ["social-impact", "community"], ["Grant writing", "Fundraising", "Event planning"]],
  ["leo", "Leo Martins", "CS student, learning React, eager to build real things.", ["technology", "education"], ["React", "TypeScript", "Writing"]],
  ["hana", "Hana Park", "Photographer and zine maker.", ["art", "events"], ["Photography", "Print design", "Storytelling"]],
  ["omar", "Omar Haddad", "Data analyst who loves public datasets.", ["research", "social-impact", "technology"], ["Data analysis", "Python", "Visualization"]],
  ["grace", "Grace Thompson", "Retired librarian. Organizer of too many book clubs.", ["community", "education", "events"], ["Community building", "Research", "Writing"]],
  ["ravi", "Ravi Kumar", "Startup founder (second time). Happy to give feedback on pitches.", ["business", "technology"], ["Fundraising", "Product strategy", "Marketing"]],
];
const U = {};
for (const [username, name, bio, interests, skills] of people) {
  const uid = id();
  U[username] = uid;
  const created = ago((20 + Math.floor(Math.random() * 20)) * D);
  ins("user", { id: uid, name, email: `${username}@demo.commonground.app`, email_verified: 1, created_at: created, updated_at: created });
  ins("profiles", { user_id: uid, username, display_name: name, bio, onboarded_at: created, created_at: created, updated_at: created, collab_prefs: JSON.stringify({ openTo: ["projects", "volunteer"], hoursPerWeek: 3 + (username.length % 6) }) });
  for (const c of interests) ins("user_interests", { user_id: uid, category: c });
  for (const s of skills) {
    const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    out.push(`INSERT OR IGNORE INTO skills (id,slug,name) VALUES (${q(id())},${q(slug)},${q(s)});`);
    out.push(`INSERT OR IGNORE INTO user_skills (user_id,skill_id) SELECT ${q(uid)}, id FROM skills WHERE slug = ${q(slug)};`);
  }
}
U.colin = ME;
const all = Object.keys(U);

// follows
for (const [a, b] of [["colin", "maya"], ["colin", "amara"], ["colin", "daniel"], ["maya", "colin"], ["leo", "colin"], ["sofia", "grace"], ["kenji", "maya"], ["omar", "amara"], ["grace", "sofia"], ["ravi", "maya"], ["hana", "kenji"], ["daniel", "omar"]])
  out.push(`INSERT OR IGNORE INTO follows (follower_id,followee_id,created_at) VALUES (${q(U[a])},${q(U[b])},${ago(5 * D)});`);

// ---------- discussions ----------
const posts = [];
function post(author, kind, category, title, body, ageMs, extra = {}) {
  const pid = id();
  ins("discussions", { id: pid, author_id: U[author], kind, title, body, category, created_at: ago(ageMs), updated_at: ago(ageMs), last_activity_at: ago(ageMs), ...extra });
  posts.push(pid);
  return pid;
}
function comment(discussion, author, body, ageMs, parent = null) {
  const cid = id();
  ins("comments", { id: cid, discussion_id: discussion, author_id: U[author], parent_id: parent, body, created_at: ago(ageMs), updated_at: ago(ageMs) });
  return cid;
}
function react(discussion, users, kind = "spark") {
  for (const u of users) out.push(`INSERT OR IGNORE INTO reactions (user_id,target_type,target_id,kind,created_at) VALUES (${q(U[u])},'discussion',${q(discussion)},${q(kind)},${ago(2 * D)});`);
}

const pToolLib = post("amara", "idea", "community", "What if our block had a shared tool library?", "Most of us own a drill we use twice a year. What if we pooled tools in one place and lent them out — like a library?\n\n- Free for neighbors\n- A simple online catalog\n- Volunteers run pickup on Saturdays\n\nWould you use it? Would you help?", 12 * D);
const c1 = comment(pToolLib, "daniel", "Yes! I'd donate my ladder and a pressure washer. I can also build the catalog website.", 12 * D - 3 * H);
comment(pToolLib, "grace", "The library on 5th St. has an empty storage room — I can ask the branch manager.", 11 * D);
comment(pToolLib, "amara", "@grace that would be perfect. Let's make this real.", 11 * D - 2 * H, c1);
comment(pToolLib, "hana", "I'll design posters for the launch 📸", 10 * D);
react(pToolLib, ["daniel", "grace", "hana", "maya", "colin", "omar"]);
react(pToolLib, ["daniel", "hana"], "helping");

const pChem = post("sofia", "idea", "education", "Bite-size chemistry videos made by students, for students", "My students explain concepts to each other better than I do. Idea: they script and film 60-second videos, we publish them free for any school.\n\nNeed: someone who edits video, and someone who can host them simply.", 9 * D);
comment(pChem, "leo", "I can build a simple site for this. Would be a great first real project for me.", 9 * D - 5 * H);
comment(pChem, "hana", "Happy to teach students basic lighting and framing with phones.", 8 * D);
react(pChem, ["leo", "hana", "grace", "colin"]);
react(pChem, ["leo"], "helping");

post("kenji", "discussion", "art", "How do you stay motivated on long solo projects?", "Two years into my game and some weeks I don't open the editor at all. What keeps you going when nobody is waiting for the result?", 6 * D);
comment(posts.at(-1), "maya", "Ship tiny public updates. A weekly gif kept me honest for a year.", 6 * D - 2 * H);
comment(posts.at(-1), "ravi", "Find one person who expects a demo every Friday. Accountability beats motivation.", 5 * D);
react(posts.at(-1), ["maya", "ravi", "leo"], "insight");

const pData = post("omar", "idea", "social-impact", "Mapping heat risk street by street", "City temperature data is public but nobody can read it. I want to turn it into a simple map so residents can see which blocks need trees and cooling centers.\n\nLooking for a designer and someone who knows the neighborhood associations.", 4 * D);
comment(pData, "amara", "Our families live in exactly those blocks. I can connect you with three associations.", 4 * D - 6 * H);
react(pData, ["amara", "daniel", "colin", "maya"]);
react(pData, ["maya"], "helping");

post("grace", "discussion", "community", "Book club for people who don't usually read", "Short books, audiobook versions allowed, snacks mandatory. Would you come? What should our first book be?", 3 * D);
comment(posts.at(-1), "sofia", "Count me in. First book: *Piranesi* — short and weird in a good way.", 3 * D - H);
react(posts.at(-1), ["sofia", "hana", "kenji"]);

post("ravi", "discussion", "business", "Pitch feedback swap — every Thursday?", "Founders and student teams: bring a 3-minute pitch, get honest feedback, give feedback to two others. Free, online, 45 minutes.", 2 * D);
react(posts.at(-1), ["leo", "colin"], "insight");

post("leo", "discussion", "technology", "Best way to learn by contributing to real projects?", "Tutorials are fine, but I want to work on something people actually use. How did you find your first real project?", 30 * H);
comment(posts.at(-1), "daniel", "Join a project here and take the smallest task. Seriously — that's how I started.", 28 * H);
comment(posts.at(-1), "colin", "Check the Collaborate tab — the tool library needs help with its catalog site.", 26 * H);

post("hana", "idea", "events", "Neighborhood photo walk + pop-up exhibition", "One Saturday, 20 people, phones only. Two weeks later we print the best shots and hang them in the café on Main St.", 20 * H);
react(posts.at(-1), ["kenji", "grace", "maya"]);

post("maya", "discussion", "lifestyle", "Your favorite low-tech habit?", "Mine: paper to-do list every morning, no apps. What's yours?", 8 * H);
comment(posts.at(-1), "grace", "Library card. Still the best subscription in the world.", 6 * H);
react(posts.at(-1), ["grace", "kenji", "sofia", "omar"]);

const pColin = post("colin", "idea", "technology", "A study-buddy matcher for university courses", "Every semester people post 'anyone want to study for X together?' in random group chats. What if there were one place to find a study partner for the exact course and time?\n\nLooking for feedback before building anything.", 2 * D);
comment(pColin, "leo", "I'd use this today. Matching by course code + availability would be enough for v1.", 40 * H);
comment(pColin, "sofia", "Consider letting tutors offer free group sessions too.", 30 * H);
comment(pColin, "ravi", "Validate with one course first. Don't build the matcher, just run it manually in a form for a week.", 20 * H);
react(pColin, ["leo", "sofia", "ravi", "maya"]);
react(pColin, ["leo"], "helping");

// ---------- projects ----------
function project(owner, slug, title, summary, description, goals, category, status, isSoftware, sourceDiscussion, ageMs, tags) {
  const pid = id();
  ins("projects", { id: pid, slug, owner_id: U[owner], title, summary, description, goals: JSON.stringify(goals), outcomes: "", category, status, visibility: "public", is_software: isSoftware ? 1 : 0, tags: JSON.stringify(tags), links: "[]", source_discussion_id: sourceDiscussion, created_at: ago(ageMs), updated_at: ago(ageMs / 4) });
  ins("project_members", { project_id: pid, user_id: U[owner], role: "owner", created_at: ago(ageMs) });
  if (sourceDiscussion) out.push(`UPDATE discussions SET converted_project_id = ${q(pid)} WHERE id = ${q(sourceDiscussion)};`);
  return pid;
}
const member = (p, u, role, ageMs) => ins("project_members", { project_id: p, user_id: U[u], role, created_at: ago(ageMs) });
function opp(p, by, title, description, deliverable, commitment, compensation, ageMs, skills = [], status = "open") {
  const oid = id();
  ins("opportunities", { id: oid, project_id: p, created_by: U[by], title, description, deliverable, commitment, compensation, status, created_at: ago(ageMs), updated_at: ago(ageMs) });
  for (const s of skills) {
    const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    out.push(`INSERT OR IGNORE INTO skills (id,slug,name) VALUES (${q(id())},${q(slug)},${q(s)});`);
    out.push(`INSERT OR IGNORE INTO opportunity_skills (opportunity_id,skill_id) SELECT ${q(oid)}, id FROM skills WHERE slug = ${q(slug)};`);
  }
  return oid;
}
const apply = (o, p, u, msg, status, ageMs, reviewer = null) => ins("applications", { id: id(), opportunity_id: o, project_id: p, applicant_id: U[u], message: msg, status, reviewed_by: reviewer ? U[reviewer] : null, reviewed_at: reviewer ? ago(ageMs - H) : null, created_at: ago(ageMs), updated_at: ago(ageMs) });
function task(p, by, title, status, assignee, type, ageMs, description = "", isCoding = 0) {
  const tid = id();
  ins("tasks", { id: tid, project_id: p, title, description, status, assignee_id: assignee ? U[assignee] : null, created_by: U[by], contribution_type: type, is_coding: isCoding, created_at: ago(ageMs), updated_at: ago(ageMs / 2) });
  return tid;
}
function verified(p, u, t, type, title, summary, verifier, ageMs, authorship = "human", agent = null) {
  const sid = id(), cid = id();
  if (t) ins("task_submissions", { id: sid, task_id: t, submitter_id: U[u], summary, authorship, agent_label: agent, status: "approved", reviewed_by: U[verifier], reviewed_at: ago(ageMs), created_at: ago(ageMs + 6 * H) });
  ins("contributions", { id: cid, project_id: p, user_id: U[u], task_id: t, submission_id: t ? sid : null, type, title, description: summary, authorship, agent_label: agent, status: "verified", verified_by: U[verifier], verified_at: ago(ageMs), created_at: ago(ageMs + 6 * H) });
  ins("contribution_verifications", { id: id(), contribution_id: cid, actor_id: U[verifier], action: "verified", created_at: ago(ageMs) });
}
const update = (p, by, title, body, milestone, ageMs, feed = true, category = "community") => {
  ins("project_updates", { id: id(), project_id: p, author_id: U[by], title, body, is_milestone: milestone ? 1 : 0, created_at: ago(ageMs) });
  if (feed) ins("discussions", { id: id(), author_id: U[by], kind: "update", title, body, category, project_id: p, created_at: ago(ageMs), updated_at: ago(ageMs), last_activity_at: ago(ageMs) });
};

// 1) Tool library — the flagship demo (building, many contributors, from a discussion)
const prTool = project("amara", "block-tool-library", "Block Tool Library", "A free tool-lending library run by neighbors, for neighbors.", "We're turning the empty storage room at the 5th St. library into a tool library. Neighbors donate tools, volunteers run Saturday pickups, and a simple website shows what's available.", ["Collect 100 donated tools", "Open Saturday pickups by next month", "Launch an online catalog anyone can browse"], "community", "building", true, pToolLib, 10 * D, ["neighborhood", "sharing", "volunteer"]);
member(prTool, "daniel", "admin", 9 * D); member(prTool, "grace", "contributor", 9 * D); member(prTool, "hana", "contributor", 8 * D); member(prTool, "colin", "contributor", 7 * D);
const oPoster = opp(prTool, "amara", "Launch poster designer", "Design a friendly A2 poster for libraries and cafés.", "Print-ready poster + Instagram square", "~4 hrs", "volunteer", 9 * D, ["Illustration", "Print design"], "filled");
opp(prTool, "amara", "Saturday pickup volunteers", "Help neighbors check out and return tools, 10am–1pm on Saturdays. No experience needed.", "Two Saturday shifts per month", "3 hrs/week", "volunteer", 5 * D, ["Community building"]);
const oCatalog = opp(prTool, "daniel", "Help build the online catalog", "We have a basic site. Need help adding search and a 'reserve' button.", "Search + reservation feature merged", "~6 hrs over 2 weeks", "credit", 3 * D, ["React", "TypeScript"]);
apply(oPoster, prTool, "hana", "I make zines and posters for local events — here's my portfolio. I'd love to do this!", "accepted", 8 * D, "amara");
apply(oCatalog, prTool, "leo", "I'm learning React and this would be my first real project. I can put in time every evening.", "pending", 20 * H);
const tPoster = task(prTool, "amara", "Design the launch poster", "done", "hana", "design", 8 * D);
verified(prTool, "hana", tPoster, "design", "Design the launch poster", "A2 poster + Instagram version, printed 40 copies.", "amara", 6 * D);
const tRoom = task(prTool, "amara", "Get permission for the library storage room", "done", "grace", "community", 9 * D);
verified(prTool, "grace", tRoom, "community", "Get permission for the library storage room", "Branch manager approved Saturdays 10–1, signed agreement uploaded.", "amara", 7 * D);
const tSite = task(prTool, "daniel", "Build the catalog website (v1)", "done", "daniel", "code", 7 * D, "List of tools with photos and availability.", 1);
verified(prTool, "daniel", tSite, "code", "Build the catalog website (v1)", "Static catalog with 64 tools, deployed.", "amara", 4 * D, "ai_assisted", "Claude Code");
task(prTool, "daniel", "Add search to the catalog", "todo", null, "code", 2 * D, "Let people search by tool name and category.", 1);
task(prTool, "amara", "Write the borrowing rules (one page)", "in_progress", "colin", "documentation", 2 * D, "Keep it friendly: how long you can borrow, what if something breaks.");
task(prTool, "amara", "Label and photograph donated tools", "in_progress", "hana", "documentation", 3 * D);
task(prTool, "daniel", "Set up a reservation button", "todo", null, "code", D, "", 1);
ins("contributions", { id: id(), project_id: prTool, user_id: U.daniel, type: "research", title: "Compared 3 tool-library software options", description: "Shared notes in the project discussion.", authorship: "human", status: "pending", created_at: ago(20 * H) });
update(prTool, "amara", "We have a room! 🎉", "The 5th St. library said yes. Saturdays 10–1, starting next month. Huge thanks to @grace.", true, 7 * D);
update(prTool, "daniel", "64 tools catalogued", "The catalog site is live. Next up: search and reservations — we're looking for help!", false, 4 * D);
const pdTool = id();
ins("discussions", { id: pdTool, author_id: U.amara, kind: "discussion", title: "Which day works for the opening party?", body: "Thinking the first Saturday of next month. Objections?", category: "community", project_id: prTool, created_at: ago(2 * D), updated_at: ago(2 * D), last_activity_at: ago(2 * D) });
comment(pdTool, "grace", "Works for me. The library can lend us folding tables.", 2 * D - 2 * H);
comment(pdTool, "colin", "I'll bring snacks.", 40 * H);

// 2) Student chemistry videos — recruiting, from a discussion
const prChem = project("sofia", "chem-in-60", "Chem in 60", "Free 60-second chemistry explainers written and filmed by students.", "Students script, film and edit one-minute videos on core chemistry concepts. Every video is reviewed by a teacher and published free for any classroom.", ["Publish 20 videos this semester", "Get 3 other schools using them"], "education", "recruiting", false, pChem, 7 * D, ["students", "video", "open-education"]);
member(prChem, "leo", "contributor", 6 * D); member(prChem, "hana", "contributor", 6 * D);
opp(prChem, "sofia", "Video editor (mentor)", "Teach two student teams basic editing in CapCut or DaVinci, review their cuts.", "4 edited videos + a 1-page editing guide", "2 hrs/week for a month", "volunteer", 6 * D, ["Video", "Teaching"]);
opp(prChem, "sofia", "Science reviewer", "Check scripts for accuracy before filming.", "Reviewed scripts", "1 hr/week", "credit", 3 * D, ["Chemistry", "Research"]);
const tLight = task(prChem, "sofia", "Phone lighting workshop for students", "done", "hana", "design", 5 * D);
verified(prChem, "hana", tLight, "design", "Phone lighting workshop for students", "45-minute workshop, 18 students, cheat-sheet shared.", "sofia", 3 * D);
task(prChem, "sofia", "Script: What is a mole?", "in_review", "leo", "documentation", 2 * D);
task(prChem, "sofia", "Set up the video website", "todo", null, "code", 2 * D);
update(prChem, "sofia", "First video is up!", "“Why does ice float?” — 58 seconds, filmed by 10th graders. 3 schools have asked to use it.", true, 2 * D, true, "education");

// 3) Heat map — exploring, software
const prHeat = project("omar", "street-heat-map", "Street Heat Map", "A simple map showing which blocks get dangerously hot, using public city data.", "Turning public temperature and tree-canopy data into a street-level map residents can actually read, to push for trees and cooling centers where they're needed most.", ["Map every block in 3 neighborhoods", "Present to city council in spring"], "social-impact", "exploring", true, pData, 3 * D, ["data", "climate", "maps"]);
member(prHeat, "amara", "contributor", 3 * D);
opp(prHeat, "omar", "Map designer", "Make the map understandable for non-technical residents: colors, legend, mobile layout.", "Figma design for map + legend", "~8 hrs", "volunteer", 2 * D, ["UI design", "Visualization"]);
opp(prHeat, "omar", "Frontend developer", "Build the map page from the design (Leaflet or MapLibre).", "Working map page", "~10 hrs", "paid", 2 * D, ["React", "Maps"]);
task(prHeat, "omar", "Clean the 2025 temperature dataset", "in_progress", "omar", "research", 2 * D, "", 1);

// 4) Colin's own project — so the owner view has things to manage
const prStudy = project("colin", "study-buddy", "Study Buddy", "Find a study partner for your exact course and time slot.", "Starting with one course and a simple form, then automating matching once we know what people need.", ["Run a manual matching pilot for one course", "Match 30 students in the first two weeks"], "education", "recruiting", true, null, 36 * H, ["university", "students"]);
member(prStudy, "leo", "contributor", 30 * H);
const oSurvey = opp(prStudy, "colin", "Survey designer", "Design a 5-question sign-up form and help analyze responses.", "Google Form + summary of the first 30 responses", "~3 hrs", "volunteer", 30 * H, ["Research", "Writing"]);
opp(prStudy, "colin", "Campus outreach", "Share the pilot in class group chats and student clubs.", "50 sign-ups", "2 hrs/week", "volunteer", 30 * H, ["Community building", "Marketing"]);
apply(oSurvey, prStudy, "grace", "Librarian here — I've designed a lot of patron surveys. Happy to help keep it short and clear.", "pending", 10 * H);
apply(oSurvey, prStudy, "omar", "I can help with the analysis side and make a quick dashboard of responses.", "pending", 5 * H);
const tForm = task(prStudy, "colin", "Draft the sign-up form questions", "in_review", "leo", "research", 28 * H, "Course, preferred times, study style, contact.");
ins("task_submissions", { id: id(), task_id: tForm, submitter_id: U.leo, summary: "Drafted 6 questions; cut it to 5 after testing on 3 friends. Link inside.", link: "https://forms.example.com/study-buddy-draft", authorship: "ai_assisted", agent_label: "ChatGPT", status: "submitted", created_at: ago(6 * H) });
task(prStudy, "colin", "Pick the pilot course", "todo", null, "research", 20 * H);
task(prStudy, "colin", "Landing page for the pilot", "todo", null, "code", 20 * H, "One page: what it is, sign-up button, FAQ.", 1);

// 5) Completed project — shows a finished outcome
const prZine = project("hana", "main-st-zine", "Main St. Photo Zine", "A printed zine of neighbors' photos of Main Street.", "20 neighbors, one photo walk, 32 printed pages. Copies are free at the café.", ["Print 200 copies", "Host a launch night"], "art", "completed", false, null, 25 * D, ["photography", "print"]);
member(prZine, "kenji", "contributor", 24 * D); member(prZine, "grace", "contributor", 24 * D);
verified(prZine, "kenji", null, "design", "Cover illustration", "Pixel-art cover, two color variants.", "hana", 18 * D);
verified(prZine, "grace", null, "community", "Organized the launch night", "40 people came; the café sold out of cinnamon rolls.", "hana", 15 * D);
update(prZine, "hana", "Printed and launched 📚", "200 copies printed, 40 people at launch night. Thank you everyone!", true, 15 * D, true, "art");

// ---------- notifications for Colin ----------
const note = (type, actor, title, body, url, ageMs, read = false) => ins("notifications", { id: id(), user_id: ME, actor_id: actor ? U[actor] : null, type, title, body, url, read_at: read ? ago(ageMs - H) : null, created_at: ago(ageMs) });
note("application", "omar", "Omar Haddad applied for “Survey designer”", "I can help with the analysis side…", "/p/study-buddy/opportunities", 5 * H);
note("application", "grace", "Grace Thompson applied for “Survey designer”", "Librarian here — I've designed a lot of patron surveys…", "/p/study-buddy/opportunities", 10 * H);
note("submission", "leo", "Leo Martins submitted “Draft the sign-up form questions” for review", "", "/p/study-buddy/tasks", 6 * H);
note("comment", "ravi", "Ravi Kumar commented on “A study-buddy matcher for university courses”", "Validate with one course first…", `/d/${pColin}`, 20 * H);
note("task_assigned", "amara", "You were assigned “Write the borrowing rules (one page)”", "", "/p/block-tool-library/tasks", 2 * D, true);
note("project_update", "daniel", "Block Tool Library: 64 tools catalogued", "", "/p/block-tool-library/updates", 4 * D, true);

// ---------- recompute counters from real rows ----------
out.push(`UPDATE discussions SET comment_count = (SELECT count(*) FROM comments c WHERE c.discussion_id = discussions.id AND c.status = 'published'), reaction_count = (SELECT count(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = discussions.id), last_activity_at = COALESCE((SELECT max(created_at) FROM comments c WHERE c.discussion_id = discussions.id), last_activity_at);`);

out.push(`INSERT OR IGNORE INTO votes (user_id, discussion_id, value, created_at) SELECT user_id, target_id, 1, created_at FROM reactions WHERE target_type = 'discussion' AND kind = 'spark';`);
console.log(out.join("\n"));

console.error(`users=${people.length} discussions=${posts.length} projects=5 statements=${out.length}`);
