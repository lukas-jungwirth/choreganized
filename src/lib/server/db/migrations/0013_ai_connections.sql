CREATE TABLE `ai_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`slot` text NOT NULL,
	`provider` text NOT NULL,
	`api_key` text NOT NULL,
	`model` text NOT NULL,
	`vision` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_connections_household_slot_idx` ON `ai_connections` (`household_id`,`slot`);--> statement-breakpoint
-- Carry a plan-13 Gemini key over as the household's primary connection, on the
-- model plan 13 called (→ plan 20). The id and the ms timestamps are minted
-- here because `id()` and `createdAt()` are JS-side defaults: a v4-shaped UUID,
-- and "now" from julianday, which every SQLite has. Blank keys are left behind.
INSERT INTO `ai_connections` (`id`, `household_id`, `slot`, `provider`, `api_key`, `model`, `vision`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	`id`, 'primary', 'gemini', trim(`gemini_api_key`), 'gemini-flash-latest', 1,
	CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
	CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `households`
WHERE `gemini_api_key` IS NOT NULL AND trim(`gemini_api_key`) <> '';--> statement-breakpoint
-- A plain DROP COLUMN, not drizzle's table rebuild: the migrator runs inside one
-- transaction where `PRAGMA foreign_keys=OFF` is a no-op, so a rebuild's
-- `DROP TABLE households` would cascade through every household's data.
ALTER TABLE `households` DROP COLUMN `gemini_api_key`;