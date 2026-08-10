CREATE TABLE `recipe_step_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`step_id`) REFERENCES `recipe_steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `recipe_ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_step_ingredients_step_idx` ON `recipe_step_ingredients` (`step_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_step_ingredients_pair_unique` ON `recipe_step_ingredients` (`step_id`,`ingredient_id`);--> statement-breakpoint
ALTER TABLE `recipe_steps` ADD `ingredients_set` integer DEFAULT false NOT NULL;