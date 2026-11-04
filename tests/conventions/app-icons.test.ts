/**
 * The app icons `npm run icons` builds from `artwork/raccoon/app-icon*.png`
 * (→ DECISIONS #235). The raccoon is a bust ending in a flat cut, so each icon
 * is laid out from the artwork rather than its canvas; these read the shipped
 * PNGs and fail on the layouts that went wrong before that:
 *
 * - **standing**: the cut sits on the bottom edge. Centred, the body ends in
 *   mid-air with green below it.
 * - **inside the mask**: a launcher may crop a maskable icon to the circle of
 *   80% diameter (the W3C safe zone). Nothing but green may be outside it in
 *   the top half, where the ears are; the bottom half is the body, which the
 *   mask is welcome to cut.
 * - **headroom**: the tab icon's top row is green, so the ears aren't cropped.
 */
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { describe, it } from 'vitest';

const GREEN = [0x74, 0xa5, 0x85];

async function pixels(file: string) {
	const { data, info } = await sharp(`static/icons/${file}`)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const size = info.width;
	const isGreen = (x: number, y: number) => {
		const i = (y * size + x) * 3;
		return GREEN.every((value, c) => Math.abs(data[i + c] - value) <= 12);
	};
	return { size, isGreen };
}

/** How much of a row isn't the background. */
function artShare(size: number, isGreen: (x: number, y: number) => boolean, y: number) {
	let art = 0;
	for (let x = 0; x < size; x++) if (!isGreen(x, y)) art++;
	return art / size;
}

describe('app icons', () => {
	for (const file of ['icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png']) {
		it(`${file}: the bust stands on the bottom edge`, async () => {
			const { size, isGreen } = await pixels(file);
			const share = artShare(size, isGreen, size - 1);
			assert.ok(
				share > 0.25,
				`${file}: only ${(share * 100).toFixed(0)}% of the bottom row is raccoon — the body ends above the edge`
			);
		});
	}

	it('icon-512-maskable.png: the ears stay inside the 80% safe circle', async () => {
		const { size, isGreen } = await pixels('icon-512-maskable.png');
		const radius = size * 0.4;
		const outside: string[] = [];
		for (let y = 0; y < size / 2; y++) {
			for (let x = 0; x < size; x++) {
				if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= radius) continue;
				if (!isGreen(x, y)) outside.push(`${x},${y}`);
			}
		}
		assert.deepEqual(
			outside.slice(0, 5),
			[],
			`${outside.length} raccoon pixels outside the circle`
		);
	});

	for (const file of ['favicon-32.png', 'favicon-96.png']) {
		it(`${file}: the ears aren't cropped`, async () => {
			const { size, isGreen } = await pixels(file);
			assert.equal(artShare(size, isGreen, 0), 0, `${file}: the top row cuts through the raccoon`);
		});
	}
});
