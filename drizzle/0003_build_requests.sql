CREATE TABLE `build_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`builder` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`task_id` text,
	`opportunity_id` text,
	`built_by` text,
	`preview_url` text,
	`live_url` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "build_requests_builder_ck" CHECK("build_requests"."builder" in ('community','team')),
	CONSTRAINT "build_requests_status_ck" CHECK("build_requests"."status" in ('requested','building','review','live','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `build_requests_project_idx` ON `build_requests` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `build_requests_team_idx` ON `build_requests` (`builder`,`status`);