ALTER TABLE `task_completions` ADD `group_id` text;--> statement-breakpoint
CREATE INDEX `task_completions_group_idx` ON `task_completions` (`group_id`);