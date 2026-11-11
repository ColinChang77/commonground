// The YC demo story as real records (labeled sample content): Alex posts → Maya & Ryan reply → project →
// Maya's design → Ryan's AI agent → Alex reviews → outcome shared. Idempotent (fixed ids). Also marks all
// demo profiles as samples and backfills project activity for demo projects.
// Usage: node scripts/seed-story.mjs > /tmp/story.sql && npx wrangler d1 execute commonground --remote --file /tmp/story.sql
const q = (s) => (s === null || s === undefined ? "NULL" : typeof s === "number" ? String(s) : `'${String(s).replace(/'/g, "''")}'`);
const out = [];
const ins = (t, row) => out.push(`INSERT OR IGNORE INTO ${t} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(q).join(",")});`);
const NOW = Date.now(), H = 3600_000, D = 24 * H, ago = (ms) => NOW - ms;
const ID = (n) => `5a000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sel = (username) => `(SELECT user_id FROM profiles WHERE username = '${username}')`;

// People: Alex and Ryan join the existing demo cast (Maya = maya)
for (const [n, username, name, bio] of [[1, "alex", "Alex Rivera", "Organizes the monthly clothes swap on Elm St."], [2, "ryan", "Ryan Brooks", "Weekend developer. Likes building small useful things with AI."]]) {
  ins("user", { id: ID(n), name, email: `${username}@demo.commonground.app`, email_verified: 1, created_at: ago(30 * D), updated_at: ago(30 * D) });
  ins("profiles", { user_id: ID(n), username, display_name: name, bio, is_demo: 1, onboarded_at: ago(30 * D), created_at: ago(30 * D), updated_at: ago(30 * D) });
}
out.push(`UPDATE profiles SET is_demo = 1 WHERE user_id IN (SELECT id FROM user WHERE email LIKE '%@demo.commonground.app');`);
out.push(`INSERT OR IGNORE INTO user_interests (user_id, category) VALUES (${q(ID(1))}, 'community'), (${q(ID(2))}, 'technology');`);

const ALEX = q(ID(1)), RYAN = q(ID(2)), MAYA = sel("maya");
const raw = (sql) => out.push(sql);
// 1. Alex posts the idea
const POST = ID(10);
raw(`INSERT OR IGNORE INTO discussions (id, author_id, kind, title, body, category, created_at, updated_at, last_activity_at) VALUES (${q(POST)}, ${ALEX}, 'idea', 'A simple sign-up page for our clothes swap nights', ${q("Every month 40+ people text me to ask when the next swap is and whether there's space. I'd love one simple page where people can see the next date and sign up.\n\nI'm not technical at all — would anyone help?")}, 'community', ${ago(6 * D)}, ${ago(6 * D)}, ${ago(5 * D)});`);
raw(`INSERT OR IGNORE INTO comments (id, discussion_id, author_id, body, created_at, updated_at) VALUES (${q(ID(11))}, ${q(POST)}, ${MAYA}, 'Love this! I can design it — something friendly with photos from past swaps.', ${ago(6 * D - 2 * H)}, ${ago(6 * D - 2 * H)});`);
raw(`INSERT OR IGNORE INTO comments (id, discussion_id, author_id, body, created_at, updated_at) VALUES (${q(ID(12))}, ${q(POST)}, ${RYAN}, ${q("I'd help build it. With an AI coding agent this is an evening of work, and you can review everything before it goes live.")}, ${ago(6 * D - 4 * H)}, ${ago(6 * D - 4 * H)});`);
raw(`INSERT OR IGNORE INTO reactions (user_id, target_type, target_id, kind, created_at) VALUES (${RYAN}, 'discussion', ${q(POST)}, 'helping', ${ago(6 * D - 4 * H)}), (${MAYA}, 'discussion', ${q(POST)}, 'helping', ${ago(6 * D - 2 * H)});`);
raw(`INSERT OR IGNORE INTO votes (user_id, discussion_id, value, created_at) SELECT id, ${q(POST)}, 1, ${ago(5 * D)} FROM user WHERE email LIKE '%@demo.commonground.app';`);

// 2. It becomes a project
const P = ID(20);
raw(`INSERT OR IGNORE INTO projects (id, slug, owner_id, title, summary, description, goals, outcomes, category, status, visibility, is_software, open_join, links, tags, source_discussion_id, created_at, updated_at) VALUES (${q(P)}, 'swap-night', ${ALEX}, 'Swap Night', 'One friendly page to see the next clothes swap and save a spot.', ${q("Started from Alex's post. Maya designs it, Ryan builds it with an AI coding agent, Alex reviews and launches.")}, ${q(JSON.stringify(["Show the next swap date", "Let people save a spot in under a minute", "Launch before the next swap"]))}, 'Neighbors sign up on their own instead of texting Alex.', 'community', 'completed', 'public', 1, 1, '[]', ${q(JSON.stringify(["neighborhood", "sample"]))}, ${q(POST)}, ${ago(5 * D)}, ${ago(D)});`);
raw(`UPDATE discussions SET converted_project_id = ${q(P)} WHERE id = ${q(POST)};`);
raw(`INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at) VALUES (${q(P)}, ${ALEX}, 'owner', ${ago(5 * D)});`);
raw(`INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at) SELECT ${q(P)}, user_id, 'contributor', ${ago(5 * D - H)} FROM profiles WHERE username = 'maya';`);
raw(`INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at) VALUES (${q(P)}, ${RYAN}, 'contributor', ${ago(5 * D - 2 * H)});`);

// 3. Tasks, Maya's design, Ryan's agent build, Alex's review
const T1 = ID(30), T2 = ID(31);
raw(`INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, contribution_type, is_coding, assignee_id, created_by, created_at, updated_at) SELECT ${q(T1)}, ${q(P)}, 'Design the sign-up page', 'Friendly, phone-first, with a photo of a past swap.', 'done', 'design', 0, user_id, ${ALEX}, ${ago(5 * D)}, ${ago(4 * D)} FROM profiles WHERE username = 'maya';`);
raw(`INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, contribution_type, is_coding, assignee_id, created_by, created_at, updated_at) VALUES (${q(T2)}, ${q(P)}, 'Build the sign-up page', 'From Maya''s design. Name, email, and which swap.', 'done', 'code', 1, ${RYAN}, ${ALEX}, ${ago(5 * D)}, ${ago(2 * D)});`);
raw(`INSERT OR IGNORE INTO task_submissions (id, task_id, submitter_id, summary, link, authorship, status, reviewed_by, reviewed_at, created_at) SELECT ${q(ID(40))}, ${q(T1)}, user_id, 'Mobile + desktop mockups in Figma, with the swap photo and a big "Save my spot" button.', 'https://www.figma.com/', 'human', 'approved', ${ALEX}, ${ago(4 * D)}, ${ago(4 * D + 3 * H)} FROM profiles WHERE username = 'maya';`);
raw(`INSERT OR IGNORE INTO contributions (id, project_id, user_id, task_id, submission_id, type, title, description, authorship, status, verified_by, verified_at, created_at) SELECT ${q(ID(41))}, ${q(P)}, user_id, ${q(T1)}, ${q(ID(40))}, 'design', 'Design the sign-up page', 'Mobile + desktop mockups.', 'human', 'verified', ${ALEX}, ${ago(4 * D)}, ${ago(4 * D)} FROM profiles WHERE username = 'maya';`);
raw(`INSERT OR IGNORE INTO task_submissions (id, task_id, submitter_id, summary, authorship, agent_label, status, reviewed_by, reviewed_at, created_at) VALUES (${q(ID(42))}, ${q(T2)}, ${RYAN}, 'Sign-up page built from Maya''s design with form validation; 9 tests passing.', 'agent_generated', 'Claude Code', 'approved', ${ALEX}, ${ago(2 * D)}, ${ago(2 * D + 5 * H)});`);
raw(`INSERT OR IGNORE INTO contributions (id, project_id, user_id, task_id, submission_id, type, title, description, authorship, agent_label, status, verified_by, verified_at, created_at) VALUES (${q(ID(43))}, ${q(P)}, ${RYAN}, ${q(T2)}, ${q(ID(42))}, 'code', 'Build the sign-up page', 'Built with an AI coding agent, reviewed by Alex.', 'agent_generated', 'Claude Code', 'verified', ${ALEX}, ${ago(2 * D)}, ${ago(2 * D)});`);
// Sample agent session (clearly labeled) so the Build view has history to show
raw(`INSERT OR IGNORE INTO agent_runs (id, project_id, task_id, user_id, provider_id, agent_label, status, prompt, summary, started_at, finished_at, created_at) VALUES (${q(ID(50))}, ${q(P)}, ${q(T2)}, ${RYAN}, 'mcp', 'Claude Code (sample)', 'completed', 'Build the sign-up page', 'Sign-up page ready', ${ago(2 * D + 8 * H)}, ${ago(2 * D)}, ${ago(2 * D + 8 * H)});`);
const evs = [["status", "Started working on “Build the sign-up page”", {}, 8], ["log", "Building the form from Maya's design", { stage: "working" }, 7], ["log", "Running the test suite", { stage: "testing", tests_passed: 9, tests_failed: 0 }, 6], ["changes_ready", "Sign-up page ready", { stage: "changes_ready", files_changed: ["app/page.tsx", "app/signup/actions.ts", "app/signup/signup.test.ts"] }, 5]];
evs.forEach(([type, message, data, h], i) => raw(`INSERT OR IGNORE INTO agent_run_events (id, run_id, type, message, data, created_at) VALUES (${q(ID(60 + i))}, ${q(ID(50))}, ${q(type)}, ${q(message)}, ${q(JSON.stringify(data))}, ${ago(2 * D + h * H)});`));
// 4. Outcome shared back to the feed
raw(`INSERT OR IGNORE INTO project_updates (id, project_id, author_id, title, body, is_milestone, created_at) VALUES (${q(ID(70))}, ${q(P)}, ${ALEX}, 'Swap Night sign-ups are live 🎉', ${q("23 neighbors signed up for Saturday on their own. Thank you @maya for the design and @ryan (and his AI agent) for building it!")}, 1, ${ago(D)});`);
raw(`INSERT OR IGNORE INTO discussions (id, author_id, kind, title, body, category, project_id, created_at, updated_at, last_activity_at) VALUES (${q(ID(71))}, ${ALEX}, 'update', 'Swap Night sign-ups are live 🎉', ${q("23 neighbors signed up for Saturday on their own. Thank you @maya for the design and @ryan (and his AI agent) for building it!")}, 'community', ${q(P)}, ${ago(D)}, ${ago(D)}, ${ago(D)});`);

// 5. Human-readable timeline for the story
const act = [
  [ALEX, "milestone", "Alex Rivera turned the conversation “A simple sign-up page for our clothes swap nights” into this project 🎉", `/d/${POST}`, 5 * D],
  [MAYA, "joined", "Maya Lin joined the team 👋", null, 5 * D - H],
  [RYAN, "joined", "Ryan Brooks joined the team 👋", null, 5 * D - 2 * H],
  [MAYA, "task_claimed", "Maya Lin is working on “Design the sign-up page”", `/p/swap-night/tasks/${T1}`, 5 * D - 3 * H],
  [MAYA, "task_done", "“Design the sign-up page” is done ✅ — approved by Alex Rivera", `/p/swap-night/tasks/${T1}`, 4 * D],
  [RYAN, "agent", "Ryan Brooks's AI agent (Claude Code) started building “Build the sign-up page”", "/p/swap-night/build", 2 * D + 8 * H],
  [RYAN, "agent", "Ryan Brooks's AI agent is running tests for “Build the sign-up page” (9 passed)", "/p/swap-night/build", 2 * D + 6 * H],
  [RYAN, "agent", "Ryan Brooks's AI agent finished “Build the sign-up page” — waiting for the team's review", "/p/swap-night/build", 2 * D + 5 * H],
  [RYAN, "task_done", "“Build the sign-up page” is done ✅ — approved by Alex Rivera", `/p/swap-night/tasks/${T2}`, 2 * D],
  [ALEX, "milestone", "Alex Rivera shared news: “Swap Night sign-ups are live 🎉”", "/p/swap-night/updates", D],
];
act.forEach(([actor, kind, message, url, t], i) => raw(`INSERT OR IGNORE INTO project_activity (id, project_id, actor_id, kind, message, url, created_at) VALUES (${q(ID(80 + i))}, ${q(P)}, ${actor}, ${q(kind)}, ${q(message)}, ${q(url)}, ${ago(t)});`));

// 6. Backfill a timeline for the other demo projects from their real rows (only where none exists yet)
raw(`INSERT INTO project_activity (id, project_id, actor_id, kind, message, url, created_at)
  SELECT lower(hex(randomblob(16))), c.project_id, c.user_id, 'task_done', '“' || c.title || '” is done ✅', NULL, c.verified_at
  FROM contributions c JOIN projects p ON p.id = c.project_id JOIN profiles o ON o.user_id = p.owner_id
  WHERE c.status = 'verified' AND o.is_demo = 1 AND p.id != ${q(P)} AND NOT EXISTS (SELECT 1 FROM project_activity a WHERE a.project_id = c.project_id);`);
raw(`INSERT INTO project_activity (id, project_id, actor_id, kind, message, url, created_at)
  SELECT lower(hex(randomblob(16))), t.project_id, t.assignee_id, 'task_started', pr.display_name || ' is working on “' || t.title || '”', NULL, t.updated_at
  FROM tasks t JOIN profiles pr ON pr.user_id = t.assignee_id JOIN projects p ON p.id = t.project_id JOIN profiles o ON o.user_id = p.owner_id
  WHERE t.status = 'in_progress' AND o.is_demo = 1 AND NOT EXISTS (SELECT 1 FROM project_activity a WHERE a.project_id = t.project_id AND a.kind = 'task_started' AND a.message LIKE '%' || t.title || '%');`);
raw(`INSERT INTO project_activity (id, project_id, actor_id, kind, message, url, created_at)
  SELECT lower(hex(randomblob(16))), u.project_id, u.author_id, CASE u.is_milestone WHEN 1 THEN 'milestone' ELSE 'update' END, pr.display_name || ' shared news: “' || u.title || '”', NULL, u.created_at
  FROM project_updates u JOIN profiles pr ON pr.user_id = u.author_id JOIN projects p ON p.id = u.project_id
  WHERE pr.is_demo = 1 AND p.id != ${q(P)} AND NOT EXISTS (SELECT 1 FROM project_activity a WHERE a.project_id = u.project_id AND a.message LIKE '%' || u.title || '%');`);
out.push(`UPDATE discussions SET comment_count = (SELECT count(*) FROM comments c WHERE c.discussion_id = discussions.id AND c.status = 'published'), reaction_count = (SELECT count(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = discussions.id), score = (SELECT COALESCE(SUM(value), 0) FROM votes v WHERE v.discussion_id = discussions.id);`);
console.log(out.join("\n"));
