/**
 * The deploy's name and icons (→ stage.ts, DECISIONS #236): only `APP_STAGE=test`
 * makes the test look, and each set has every icon the app links to.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, it } from 'vitest';
import { BRANDING, manifestIcons, stageFrom, type Stage } from './stage';

describe('stageFrom', () => {
	it('is test only for "test", in any case or spacing', () => {
		assert.equal(stageFrom('test'), 'test');
		assert.equal(stageFrom(' TEST '), 'test');
	});

	it('is live for anything else, unset included', () => {
		for (const value of [undefined, '', 'live', 'production', 'tst', 'staging']) {
			assert.equal(stageFrom(value), 'live', String(value));
		}
	});
});

/** Every icon app.html and the manifest point a set at, with the size it must be. */
function linked(stage: Stage): Array<[string, number]> {
	const { icons } = BRANDING[stage];
	return [
		...manifestIcons(icons).map(({ src, sizes }): [string, number] => [
			src,
			Number(sizes.split('x')[0])
		]),
		[`${icons}/apple-touch-icon.png`, 180],
		[`${icons}/favicon-32.png`, 32],
		[`${icons}/favicon-96.png`, 96]
	];
}

describe('icon sets', () => {
	for (const stage of ['live', 'test'] as const) {
		it(`${stage}: every linked icon is in static/, at its size`, async () => {
			for (const [src, size] of linked(stage)) {
				const { width, height } = await sharp(`static${src}`).metadata();
				assert.deepEqual([width, height], [size, size], src);
			}
		});
	}

	it('the test set is not the live set', () => {
		const live = linked('live');
		linked('test').forEach(([src], i) => {
			assert.notDeepEqual(readFileSync(`static${src}`), readFileSync(`static${live[i][0]}`), src);
		});
	});

	it('the test app has its own name, short enough for a home screen', () => {
		assert.notEqual(BRANDING.test.name, BRANDING.live.name);
		assert.notEqual(BRANDING.test.shortName, BRANDING.live.shortName);
		assert.ok(BRANDING.test.shortName.length <= 12, BRANDING.test.shortName);
	});
});
