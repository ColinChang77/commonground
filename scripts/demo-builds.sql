-- Demo "Website & app" requests in different stages. Safe to re-run (fixed ids).
INSERT OR IGNORE INTO build_requests (id, project_id, requested_by, title, description, kind, builder, status, task_id, built_by, note, created_at, updated_at)
SELECT 'b0000000-0000-4000-8000-000000000001', p.id, p.owner_id, 'Reserve-a-tool button', 'A button next to each tool so neighbors can reserve it for a weekend. We get an email when someone reserves.', 'booking', 'community', 'requested',
  (SELECT id FROM tasks WHERE project_id = p.id AND title = 'Set up a reservation button'), NULL, NULL, unixepoch()*1000 - 86400000, unixepoch()*1000 - 86400000
FROM projects p WHERE p.slug = 'block-tool-library';

INSERT OR IGNORE INTO build_requests (id, project_id, requested_by, title, description, kind, builder, status, built_by, note, created_at, updated_at)
SELECT 'b0000000-0000-4000-8000-000000000002', p.id, p.owner_id, 'Volunteer sign-up form', 'A form where people can sign up for Saturday shifts and pick which dates they can do.', 'form', 'team', 'building',
  (SELECT user_id FROM profiles WHERE platform_role = 'admin' LIMIT 1), 'First version ready tomorrow.', unixepoch()*1000 - 2*86400000, unixepoch()*1000 - 3600000
FROM projects p WHERE p.slug = 'block-tool-library';

INSERT OR IGNORE INTO build_requests (id, project_id, requested_by, title, description, kind, builder, status, built_by, preview_url, note, created_at, updated_at)
SELECT 'b0000000-0000-4000-8000-000000000003', p.id, p.owner_id, 'Pilot landing page', 'One page explaining the Study Buddy pilot, with a big sign-up button and three FAQs.', 'landing', 'team', 'review',
  (SELECT user_id FROM profiles WHERE platform_role = 'admin' LIMIT 1), 'https://commonground.commonground-app.workers.dev/p/study-buddy', 'Here is the first version — tell us what to change!', unixepoch()*1000 - 30*3600000, unixepoch()*1000 - 2*3600000
FROM projects p WHERE p.slug = 'study-buddy';
