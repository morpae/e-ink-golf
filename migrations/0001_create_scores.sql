CREATE TABLE IF NOT EXISTS `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`initials` text NOT NULL,
	`day` text NOT NULL,
	`strokes` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scores_day_strokes_idx` ON `scores` (`day`, `strokes`, `created_at`);
