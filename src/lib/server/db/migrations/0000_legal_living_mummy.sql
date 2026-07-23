CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `cook_timers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`household_id` text NOT NULL,
	`label` text NOT NULL,
	`recipe_id` text,
	`step_index` integer,
	`ends_at` integer NOT NULL,
	`notified_at` integer,
	`canceled_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cook_timers_ends_idx` ON `cook_timers` (`ends_at`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text,
	`timezone` text DEFAULT 'Europe/Vienna' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `households_invite_code_unique` ON `households` (`invite_code`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`date` text NOT NULL,
	`recipe_id` text,
	`title` text,
	`cook_member_id` text,
	`created_by_member_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cook_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meals_household_date_unique` ON `meals` (`household_id`,`date`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`color` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`away_until` text,
	`notify_task_reminders` integer DEFAULT true NOT NULL,
	`notify_overdue_nudges` integer DEFAULT true NOT NULL,
	`notify_shopping_updates` integer DEFAULT false NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `members_household_idx` ON `members` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_unique` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`text` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_steps_recipe_idx` ON `recipe_steps` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`image_path` text,
	`time_minutes` integer,
	`servings` integer,
	`created_by_member_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipes_household_idx` ON `recipes` (`household_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`store_id` text,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`added_by_member_id` text,
	`checked_at` integer,
	`checked_by_member_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`added_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shopping_items_household_idx` ON `shopping_items` (`household_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stores_household_idx` ON `stores` (`household_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`task_id` text,
	`task_name` text NOT NULL,
	`points` integer NOT NULL,
	`action` text DEFAULT 'done' NOT NULL,
	`member_id` text,
	`member_name` text NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_completions_household_idx` ON `task_completions` (`household_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`points` integer NOT NULL,
	`recur_unit` text DEFAULT 'none' NOT NULL,
	`recur_interval` integer DEFAULT 1 NOT NULL,
	`due_date` text,
	`assignee_member_id` text,
	`rotate` integer DEFAULT false NOT NULL,
	`due_reminder_sent_at` integer,
	`overdue_reminder_sent_at` integer,
	`created_by_member_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_household_due_idx` ON `tasks` (`household_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
