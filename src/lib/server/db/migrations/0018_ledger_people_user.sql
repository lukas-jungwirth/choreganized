ALTER TABLE `ledger_people` ADD `user_id` text;--> statement-breakpoint
CREATE INDEX `ledger_people_user_idx` ON `ledger_people` (`household_id`,`user_id`);--> statement-breakpoint
-- The people that already exist belong to the user behind their membership.
UPDATE `ledger_people` SET `user_id` = (SELECT `user_id` FROM `members` WHERE `members`.`id` = `ledger_people`.`member_id`) WHERE `member_id` IS NOT NULL;
