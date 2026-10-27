CREATE TABLE `expense_recurrence_shares` (
	`recurrence_id` text NOT NULL,
	`person_id` text NOT NULL,
	`input` integer,
	PRIMARY KEY(`recurrence_id`, `person_id`),
	FOREIGN KEY (`recurrence_id`) REFERENCES `expense_recurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `ledger_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `expense_recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`paid_by_id` text NOT NULL,
	`split_mode` text NOT NULL,
	`unit` text NOT NULL,
	`anchor_day` integer,
	`next_date` text NOT NULL,
	`stopped_at` integer,
	`created_by_member_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paid_by_id`) REFERENCES `ledger_people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expense_recurrences_due_idx` ON `expense_recurrences` (`household_id`,`next_date`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `recurrence_id` text REFERENCES expense_recurrences(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `expenses_recurrence_idx` ON `expenses` (`recurrence_id`);--> statement-breakpoint
ALTER TABLE `members` ADD `notify_expenses` integer DEFAULT true NOT NULL;