ALTER TABLE `shopping_suggestions` ADD `store_id` text REFERENCES stores(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `stores` ADD `icon` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `kind` text DEFAULT 'buy' NOT NULL;
