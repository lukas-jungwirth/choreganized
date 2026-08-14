CREATE TABLE `holiday_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`closure_date` text NOT NULL,
	`pushed_at` integer,
	`hidden_until` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holiday_notices_member_closure_unique` ON `holiday_notices` (`member_id`,`closure_date`);--> statement-breakpoint
ALTER TABLE `members` ADD `notify_shop_closures` integer DEFAULT true NOT NULL;