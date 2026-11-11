-- Removes every demo account and everything they created (cascades), keeping real users.
DELETE FROM user WHERE email LIKE '%@demo.commonground.app';
DELETE FROM notifications WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM user);
DELETE FROM skills WHERE id NOT IN (SELECT skill_id FROM user_skills) AND id NOT IN (SELECT skill_id FROM opportunity_skills);
