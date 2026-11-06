CREATE TABLE `raccoon_sightings` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`raccoon` text NOT NULL,
	`first_seen_on` text NOT NULL,
	`seen_count` integer DEFAULT 1 NOT NULL,
	`last_slot` text NOT NULL,
	`noticed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raccoon_sightings_member_raccoon_unique` ON `raccoon_sightings` (`member_id`,`raccoon`);