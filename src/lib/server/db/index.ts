import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const databasePath = env.DATABASE_PATH ?? './data/choreganized.db';

function createClient() {
	mkdirSync(dirname(databasePath), { recursive: true });
	const sqlite = new Database(databasePath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('foreign_keys = ON');
	return drizzle(sqlite, { schema });
}

// `building` guard: don't open the database during `vite build` prerendering.
export const db = building
	? (undefined as unknown as ReturnType<typeof createClient>)
	: createClient();

/** Run pending migrations. Called once from the server `init` hook. */
export function runMigrations() {
	migrate(db, { migrationsFolder: 'src/lib/server/db/migrations' });
}

export * as tables from './schema';
