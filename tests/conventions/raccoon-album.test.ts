/**
 * The raccoon album holds exactly Home's raccoons (→ plan 35). `HOME_RACCOONS`
 * is tied to `homeRaccoon()` by its own test (`utils/raccoon.test.ts`), so the
 * album only has to match it: a new everyday pose from `/raccoons` that has no
 * `album` number and `stats` in `mascots.json` fails here, with the fix.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { EVERYDAY } from '$lib/assets/mascot/everyday';
import { ALBUM_ENTRIES, seasonRun } from '$lib/utils/raccoon-album';
import { HOME_RACCOONS } from '$lib/utils/raccoon';

type Entry = { name: string; album?: number; stats?: Record<string, number> };

const { mascots } = JSON.parse(readFileSync('artwork/raccoon/mascots.json', 'utf8')) as {
	mascots: Entry[];
};

describe('the raccoon album', () => {
	it('lists exactly the raccoons Home can show', () => {
		const album = new Set(ALBUM_ENTRIES.map((entry) => entry.name as string));
		for (const name of HOME_RACCOONS) {
			assert.ok(
				album.has(name),
				`${name} sits on Home but is not in the album: give it "album" (the next free number) and "stats" in artwork/raccoon/mascots.json, then npm run icons`
			);
		}
		assert.equal(album.size, HOME_RACCOONS.length, 'only Home raccoons are collectable');
	});

	it('numbers each one once, from 1 with no gaps', () => {
		const numbers = mascots.flatMap((entry) => entry.album ?? []).sort((a, b) => a - b);
		assert.deepEqual(
			numbers,
			numbers.map((_, index) => index + 1)
		);
	});

	it('gives every album raccoon four stats of 1–5', () => {
		for (const entry of mascots.filter((each) => each.album !== undefined)) {
			const values = Object.values(entry.stats ?? {});
			assert.equal(values.length, 4, `${entry.name}: four stats`);
			assert.ok(
				values.every((value) => Number.isInteger(value) && value >= 1 && value <= 5),
				`${entry.name}: each stat is 1–5`
			);
		}
	});

	it('only meets an everyday pose in one unbroken run of seasons', () => {
		for (const pose of EVERYDAY) assert.doesNotThrow(() => seasonRun(pose.seasons), pose.name);
	});

	it('has a name, a title and a fact for each, in both languages', async () => {
		const { en } = await import('$lib/i18n/messages/en');
		const { de } = await import('$lib/i18n/messages/de');
		for (const entry of ALBUM_ENTRIES) {
			for (const [language, catalog] of [
				['en', en],
				['de', de]
			] as const) {
				const copy = catalog.raccoons[entry.name];
				assert.ok(copy.name && copy.title && copy.fact, `${language}: ${entry.name}`);
				assert.ok(
					!/—/.test(copy.fact + copy.title + copy.name),
					`${language}: ${entry.name} has an em dash (DECISIONS #205)`
				);
			}
		}
	});
});
