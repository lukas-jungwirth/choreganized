CREATE TABLE `household_units` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`word` text NOT NULL,
	`word_key` text NOT NULL,
	`added_by` text,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_units_word_unique` ON `household_units` (`household_id`,`word_key`);