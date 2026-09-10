CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text,
	`member_name` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`locale` text NOT NULL,
	`theme` text,
	`app_version` text NOT NULL,
	`user_agent` text,
	`issue_number` integer,
	`synced_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_pending_idx` ON `feedback` (`issue_number`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `feedback_household_idx` ON `feedback` (`household_id`,`created_at`);