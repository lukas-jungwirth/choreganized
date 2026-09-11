/**
 * The migration folder is what production boots from (→ DATA-MODEL, the init
 * hook), so its journal and its files must agree — and `schema.ts` must not have
 * drifted from them. Drift needs drizzle-kit, which `scripts/check-migrations.ts`
 * runs against a scratch copy of the folder; the test runs the script so that
 * `npm test` is the one gate (the script stays runnable on its own).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';

const DIR = 'src/lib/server/db/migrations';

describe('migrations', () => {
	it('every journal entry has its .sql file, and every .sql file its entry', () => {
		const journal = JSON.parse(readFileSync(`${DIR}/meta/_journal.json`, 'utf8')) as {
			entries: { tag: string }[];
		};
		const tags = journal.entries.map((entry) => entry.tag).sort();
		const files = readdirSync(DIR)
			.filter((name) => name.endsWith('.sql'))
			.map((name) => name.replace(/\.sql$/, ''))
			.sort();

		assert.deepEqual(files, tags);
	});

	it('schema.ts has no change that a migration does not carry', { timeout: 60_000 }, () => {
		const result = spawnSync(process.execPath, ['scripts/check-migrations.ts'], {
			encoding: 'utf8'
		});

		assert.equal(result.status, 0, `${result.stdout}${result.stderr}${result.error ?? ''}`);
	});

	it('every migration has its snapshot', () => {
		const snapshots = readdirSync(`${DIR}/meta`).filter((name) => name.endsWith('_snapshot.json'));
		const sql = readdirSync(DIR).filter((name) => name.endsWith('.sql'));

		assert.equal(snapshots.length, sql.length);
	});
});
