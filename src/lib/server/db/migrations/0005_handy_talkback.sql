CREATE TABLE `shopping_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`last_used_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_suggestions_key_unique` ON `shopping_suggestions` (`household_id`,`name_key`);--> statement-breakpoint
CREATE INDEX `shopping_suggestions_recent_idx` ON `shopping_suggestions` (`household_id`,`last_used_at`);