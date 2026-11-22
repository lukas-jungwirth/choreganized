CREATE TABLE `recipe_tags` (
	`recipe_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `recipes` ADD `diet` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `favourite` integer DEFAULT false NOT NULL;