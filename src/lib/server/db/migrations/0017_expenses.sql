CREATE TABLE `expense_shares` (
	`expense_id` text NOT NULL,
	`person_id` text NOT NULL,
	`share_minor` integer NOT NULL,
	`input` integer,
	PRIMARY KEY(`expense_id`, `person_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `ledger_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expense_shares_person_idx` ON `expense_shares` (`person_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text,
	`category` text,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`paid_by_id` text NOT NULL,
	`split_mode` text NOT NULL,
	`created_by_member_id` text,
	`updated_by_member_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paid_by_id`) REFERENCES `ledger_people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expenses_household_date_idx` ON `expenses` (`household_id`,`date`);--> statement-breakpoint
CREATE INDEX `expenses_paid_by_idx` ON `expenses` (`paid_by_id`);--> statement-breakpoint
CREATE TABLE `ledger_people` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text,
	`kind` text DEFAULT 'member' NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`default_weight` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_people_member_id_unique` ON `ledger_people` (`member_id`);--> statement-breakpoint
CREATE INDEX `ledger_people_household_idx` ON `ledger_people` (`household_id`);--> statement-breakpoint
ALTER TABLE `households` ADD `currency` text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `split_default_mode` text DEFAULT 'equal' NOT NULL;--> statement-breakpoint
-- Every existing membership gets its ledger person (→ plan 29, DECISIONS #168);
-- from here on `services/household.ts` creates one with each membership. The id is
-- a v4-shaped UUID, like the ones `crypto.randomUUID()` writes.
INSERT INTO `ledger_people` (`id`, `household_id`, `member_id`, `kind`, `name`, `color`, `created_at`)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), `household_id`, `id`, 'member', `display_name`, `color`, `joined_at` FROM `members`;
