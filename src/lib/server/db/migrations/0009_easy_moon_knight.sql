DROP INDEX `meals_household_date_unique`;--> statement-breakpoint
ALTER TABLE `meals` ADD `slot` text DEFAULT 'dinner' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `meals_household_date_slot_unique` ON `meals` (`household_id`,`date`,`slot`);