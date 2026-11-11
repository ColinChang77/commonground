CREATE TABLE `votes` (
	`user_id` text NOT NULL,
	`discussion_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `discussion_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`discussion_id`) REFERENCES `discussions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "votes_value_ck" CHECK("votes"."value" in (-1, 1))
);
--> statement-breakpoint
CREATE INDEX `votes_discussion_idx` ON `votes` (`discussion_id`);--> statement-breakpoint
ALTER TABLE `discussions` ADD `score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `discussions_score_idx` ON `discussions` (`status`,`score`);--> statement-breakpoint
-- Backfill: existing "spark" reactions become upvotes.
INSERT OR IGNORE INTO `votes` (`user_id`, `discussion_id`, `value`, `created_at`) SELECT `user_id`, `target_id`, 1, `created_at` FROM `reactions` WHERE `target_type` = 'discussion' AND `kind` = 'spark' AND `target_id` IN (SELECT `id` FROM `discussions`);
--> statement-breakpoint
UPDATE `discussions` SET `score` = (SELECT COALESCE(SUM(`value`), 0) FROM `votes` WHERE `votes`.`discussion_id` = `discussions`.`id`);
