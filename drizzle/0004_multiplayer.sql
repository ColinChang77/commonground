CREATE TABLE `project_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`url` text,
	`task_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_activity_idx` ON `project_activity` (`project_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `agent_label` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `is_demo` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `open_join` integer DEFAULT true NOT NULL;