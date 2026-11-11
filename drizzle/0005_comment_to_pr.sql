-- CommonGround v2: showcase posts, comment → change request pipeline, contribution points.
CREATE TABLE `showcases` (
  `discussion_id` text PRIMARY KEY NOT NULL REFERENCES `discussions`(`id`) ON DELETE CASCADE,
  `builder_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `repo_full_name` text NOT NULL,
  `demo_url` text,
  `auto_pr` integer NOT NULL DEFAULT 0,
  `paused` integer NOT NULL DEFAULT 0,
  `demo_mode` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
  `id` text PRIMARY KEY NOT NULL,
  `discussion_id` text NOT NULL REFERENCES `discussions`(`id`) ON DELETE CASCADE,
  `comment_id` text NOT NULL REFERENCES `comments`(`id`) ON DELETE CASCADE,
  `author_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `risk` text NOT NULL DEFAULT 'small',
  `title` text NOT NULL,
  `restated` text NOT NULL,
  `question` text,
  `status` text NOT NULL DEFAULT 'confirming',
  `preview` text,
  `pr_number` integer,
  `triage_source` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  CONSTRAINT `suggestions_status_ck` CHECK(`status` in ('confirming','queued','running','reviewing','preview_ready','sent','pr_opened','merged','declined','builder_review'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestions_comment_uq` ON `suggestions` (`comment_id`);
--> statement-breakpoint
CREATE INDEX `suggestions_discussion_idx` ON `suggestions` (`discussion_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `suggestion_events` (
  `id` text PRIMARY KEY NOT NULL,
  `suggestion_id` text NOT NULL REFERENCES `suggestions`(`id`) ON DELETE CASCADE,
  `actor` text NOT NULL,
  `message` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `suggestion_events_idx` ON `suggestion_events` (`suggestion_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `contribution_points` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `discussion_id` text NOT NULL REFERENCES `discussions`(`id`) ON DELETE CASCADE,
  `suggestion_id` text REFERENCES `suggestions`(`id`) ON DELETE SET NULL,
  `reason` text NOT NULL,
  `points` integer NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_points_once_uq` ON `contribution_points` (`suggestion_id`, `reason`);
--> statement-breakpoint
CREATE INDEX `contribution_points_user_idx` ON `contribution_points` (`user_id`, `created_at`);
