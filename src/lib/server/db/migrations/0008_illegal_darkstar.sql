CREATE TABLE `pantry_staples` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`skip_count` integer DEFAULT 1 NOT NULL,
	`last_skipped_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_staples_key_unique` ON `pantry_staples` (`household_id`,`name_key`);