DROP INDEX `recipe_step_ingredients_pair_unique`;--> statement-breakpoint
ALTER TABLE `recipe_step_ingredients` ADD `phrase` text;--> statement-breakpoint
ALTER TABLE `recipe_step_ingredients` ADD `amount_phrase` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_step_ingredients_link_unique` ON `recipe_step_ingredients` (`step_id`,`ingredient_id`,`phrase`);--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD `note` text;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD `section` text;--> statement-breakpoint
ALTER TABLE `recipe_steps` ADD `section` text;