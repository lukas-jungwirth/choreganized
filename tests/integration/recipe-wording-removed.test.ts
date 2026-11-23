/**
 * Austrian wording is gone (→ plan 44, DECISIONS #317): migration 0030 drops
 * `households.recipe_wording`, and a household that had chosen it keeps
 * everything else. Saved recipes are untouched: their names stay as imported.
 */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, it } from 'vitest';

describe('migration 0030: recipe wording dropped', () => {
	it('drops the column and keeps the household and its recipes', () => {
		const migrations = readMigrationFiles({ migrationsFolder: 'src/lib/server/db/migrations' });
		const target = migrations.findIndex((migration) =>
			migration.sql.some((statement) => /DROP COLUMN `recipe_wording`/.test(statement))
		);
		assert.ok(target > 0, 'the migration exists');

		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		const run = (index: number) => {
			for (const statement of migrations[index].sql) if (statement.trim()) sqlite.exec(statement);
		};
		for (let index = 0; index < target; index++) run(index);

		const now = Date.now();
		sqlite
			.prepare(
				'INSERT INTO households (id, name, timezone, recipe_wording, ai_instructions, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run('h', 'Home', 'Europe/Vienna', 'austrian', 'vegetarisch', now);
		sqlite
			.prepare(
				'INSERT INTO recipes (id, household_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run('r', 'h', 'Topfenstrudel', now, now);

		run(target);

		const columns = sqlite.prepare("SELECT name FROM pragma_table_info('households')").all() as {
			name: string;
		}[];
		assert.ok(!columns.some((column) => column.name === 'recipe_wording'));
		assert.deepEqual(sqlite.prepare('SELECT name, ai_instructions FROM households').get(), {
			name: 'Home',
			ai_instructions: 'vegetarisch'
		});
		assert.deepEqual(sqlite.prepare('SELECT name FROM recipes').get(), { name: 'Topfenstrudel' });
	});
});
