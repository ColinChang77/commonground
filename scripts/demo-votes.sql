-- Reddit-style: authors upvote their own posts; a few extra votes so Hot/Top differ. Safe to re-run.
INSERT OR IGNORE INTO votes (user_id, discussion_id, value, created_at) SELECT author_id, id, 1, created_at FROM discussions WHERE kind != 'update';
INSERT OR IGNORE INTO votes (user_id, discussion_id, value, created_at)
  SELECT u.id, d.id, 1, d.created_at + 3600000 FROM discussions d JOIN user u ON u.email LIKE '%@demo.commonground.app'
  WHERE d.kind != 'update' AND d.project_id IS NULL AND (abs(random()) % 100) < 45;
UPDATE discussions SET score = (SELECT COALESCE(SUM(value), 0) FROM votes WHERE votes.discussion_id = discussions.id);
