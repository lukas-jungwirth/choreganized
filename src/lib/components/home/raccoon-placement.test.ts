/**
 * `npm test` — Home places its raccoon by its body (→ raccoon-placement.ts,
 * DECISIONS #224), checked on the real generated sizes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { MASCOTS } from '$lib/assets/mascot';
import { BODY_INSET, MAX_BLEED, MAX_REACH, raccoonPlacement } from './raccoon-placement.ts';

const HEIGHT = 136;

/** Where the body lands, from the right edge. */
function bodyFromRight(name: keyof typeof MASCOTS): number {
	const art = MASCOTS[name];
	const width = (HEIGHT * art.width) / art.height;
	return raccoonPlacement(art, HEIGHT).right + (1 - art.body) * width;
}

describe('raccoonPlacement', () => {
	it('puts a slim pose and one with a prop out to the side at the same body spot', () => {
		// phone has nothing on its right; tennis holds a ball out there.
		assert.ok(Math.abs(bodyFromRight('phone') - BODY_INSET) <= 1);
		assert.ok(Math.abs(bodyFromRight('tennis') - BODY_INSET) <= 1);
	});

	it('never reaches further left than the widest pose always has', () => {
		for (const art of Object.values(MASCOTS)) {
			assert.ok(raccoonPlacement(art, HEIGHT).reach <= MAX_REACH);
		}
		// Arms out on both sides: it gives up a little of its spot instead.
		assert.ok(bodyFromRight('welcome-a') < BODY_INSET);
	});

	it('lets a prop into the gutter, not past it', () => {
		const wide = { width: 600, height: 408, body: 0.3 };
		assert.equal(raccoonPlacement(wide, HEIGHT).right, -MAX_BLEED);
	});
});
