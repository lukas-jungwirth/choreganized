/**
 * A raccoon that sits on a card's top edge is cut flat at the waist
 * (→ DECISIONS #213, #218). The card hides only its bottom 2px, so a master
 * whose belly rounds off shows a curve resting on a straight edge, and the
 * raccoon looks like it is floating. Generated art often comes that way; this
 * reads the AVIFs `npm run icons` ships and fails on any that does.
 *
 * Flat means the row just above the cut is about as wide as a row 3% of the
 * height higher up. A rounded belly narrows fast towards the bottom: the poses
 * that came in rounded measured 0.43–0.68 before they were cut, the flat ones
 * measure 0.87 and up. Title raccoons (`PageHeader`) and `head` stand beside
 * their text rather than on a card, so they are not held to this.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, it } from 'vitest';
import type { MascotName } from '$lib/assets/mascot';

const PERCHED: MascotName[] = [
	// Home, every pose `utils/raccoon` can pick
	'welcome-a',
	'welcome-b',
	'reminder-upcoming',
	'reminder-overdue',
	'birthday',
	'christmas',
	'new-year',
	'easter',
	'halloween',
	'valentines',
	'sleeping',
	// Settings
	'settings',
	'move-out'
];

const FLAT_ENOUGH = 0.8;

async function flatness(name: MascotName): Promise<number> {
	const file = readFileSync(`src/lib/assets/mascot/${name}.avif`);
	const { data, info } = await sharp(file)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width, height } = info;

	/** Opaque width of a row, edge to edge. */
	const span = (y: number) => {
		let left = -1;
		let right = -1;
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > 128) {
				if (left < 0) left = x;
				right = x;
			}
		}
		return left < 0 ? 0 : right - left + 1;
	};

	// Two rows up from the bottom, clear of the encoder's soft edge.
	const cut = height - 3;
	return span(cut) / span(cut - Math.round(height * 0.03));
}

describe('perched raccoons', () => {
	for (const name of PERCHED) {
		it(`${name} is cut flat at the bottom`, async () => {
			const ratio = await flatness(name);
			assert.ok(
				ratio >= FLAT_ENOUGH,
				`${name}: bottom row is ${ratio.toFixed(2)}× the width 3% higher — cut the master flat (artwork/raccoon/README.md)`
			);
		});
	}
});
