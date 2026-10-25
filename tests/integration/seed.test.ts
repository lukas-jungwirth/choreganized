/**
 * The demo seed against the nightly cleanup (→ scripts/seed.ts, DECISIONS #155).
 *
 * The seed is what every screenshot is taken of, so its data has to look the same
 * at any hour. Its two "just bought" items once said "today at 09:12", and the
 * cleanup a fresh server runs after 03:30 deletes what was checked over 12 h ago,
 * so a CI run started after 21:12 lost them. This runs the real seed as a child
 * process in a timezone where it is late evening right now, so the test fails
 * that way whatever hour it runs at.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, it } from 'vitest';

/** `cron.ts`'s `CHECKED_ITEM_TTL_MS`: what the cleanup keeps. */
const CHECKED_ITEM_TTL_MS = 12 * 60 * 60 * 1000;

/** An `Etc/GMT` zone whose local time is 23:xx right now (its sign is inverted). */
function lateEveningZone(now = new Date()): string {
	let offset = 23 - now.getUTCHours();
	if (offset > 14) offset -= 24;
	return offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

describe('scripts/seed.ts', () => {
	const dir = mkdtempSync(join(tmpdir(), 'choreganized-seed-'));
	const databasePath = join(dir, 'seed.db');
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	function seed(timezone: string) {
		return spawnSync(process.execPath, ['scripts/seed.ts', 'seed@example.test'], {
			encoding: 'utf8',
			env: { ...process.env, DATABASE_PATH: databasePath, TZ: timezone }
		});
	}

	it('seeds bought items the nightly cleanup keeps, even late in the evening', () => {
		// The first run only migrates: there is no user to seed for yet.
		seed('UTC');
		const sqlite = new Database(databasePath);
		sqlite
			.prepare('insert into user (id, name, email, created_at, updated_at) values (?, ?, ?, ?, ?)')
			.run('seed-user', 'Seed', 'seed@example.test', Date.now(), Date.now());
		sqlite.close();

		const zone = lateEveningZone();
		const run = seed(zone);
		assert.equal(run.status, 0, `seed in ${zone}:\n${run.stdout}${run.stderr}`);

		const checked = new Database(databasePath, { readonly: true })
			.prepare('select checked_at as at from shopping_items where checked_at is not null')
			.all() as { at: number }[];
		const cutoff = Date.now() - CHECKED_ITEM_TTL_MS;

		assert.equal(checked.length, 2);
		for (const { at } of checked) {
			assert.ok(
				at > cutoff,
				`bought at ${new Date(at).toISOString()} is past the cleanup (${zone})`
			);
		}
	});
});
