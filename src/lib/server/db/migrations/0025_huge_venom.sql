ALTER TABLE `ledger_people` ADD `share_token` text;--> statement-breakpoint
ALTER TABLE `ledger_people` ADD `include_in_new` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_people` ADD `removed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_people_share_token_unique` ON `ledger_people` (`share_token`);