ALTER TABLE `shopping_items` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Seed the manual order from the order items are currently shown in: each item's
-- 0-based rank within its (household, store) group by (created_at, id), which is
-- exactly what `utils/shopping` `compareOpen` sorted an un-reordered list by. New
-- lists therefore look unchanged; only a deliberate drag rewrites these numbers.
UPDATE `shopping_items` SET `sort_order` = (
	SELECT count(*) FROM `shopping_items` AS `s2`
	WHERE `s2`.`household_id` = `shopping_items`.`household_id`
		AND ((`s2`.`store_id` IS NULL AND `shopping_items`.`store_id` IS NULL) OR `s2`.`store_id` = `shopping_items`.`store_id`)
		AND (`s2`.`created_at` < `shopping_items`.`created_at`
			OR (`s2`.`created_at` = `shopping_items`.`created_at` AND `s2`.`id` < `shopping_items`.`id`))
);
