/**
 * `npm test` — the silhouette measures `npm run raccoons` and the perch test
 * share (→ scripts/raccoon-art.ts). Shapes drawn in memory: a box is flat, a
 * box with a round bottom is not until it is cut, a painted background or art
 * running off the canvas is refused.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { flatCut, flatness, problems, rowSpans, type Raw } from './raccoon-art.ts';

/** A transparent canvas with the pixels `inside(x, y)` says are art. */
function draw(width: number, height: number, inside: (x: number, y: number) => boolean): Raw {
	const data = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (inside(x, y)) data[(y * width + x) * 4 + 3] = 255;
		}
	}
	return { data, width, height };
}

/** A body 160 wide, its last 60 rows rounding off like a belly — the generated kind. */
const belly = draw(200, 300, (x, y) => {
	if (x < 20 || x >= 180 || y < 10) return false;
	if (y < 240) return true;
	const depth = (y - 240) / 60; // 0 at the start of the curve, 1 at the bottom
	const half = 80 * Math.sqrt(1 - depth * depth);
	return Math.abs(x - 100) < half;
});

/** The same body cut straight at the waist — the kind that sits on a card. */
const flat = draw(200, 300, (x, y) => x >= 20 && x < 180 && y >= 10);

describe('flatness', () => {
	it('is about 1 for a straight cut and low for a round belly', () => {
		assert.ok(flatness(rowSpans(flat)) > 0.99);
		assert.ok(flatness(rowSpans(belly)) < 0.8);
	});
});

describe('flatCut', () => {
	it('leaves a flat bottom alone', () => {
		assert.equal(flatCut(rowSpans(flat)), 0);
	});

	it('cuts a round belly up to where it is flat, and no further than it must', () => {
		const spans = rowSpans(belly);
		const cut = flatCut(spans);
		assert.ok(cut !== null && cut > 0 && cut <= 60, String(cut));
		assert.ok(flatness(spans, spans.length - cut) >= 0.9);
		assert.ok(flatness(spans, spans.length - (cut - 5)) < 0.9);
	});

	it('gives up on a shape that narrows all the way down', () => {
		// A V, narrowing steadily to its point: the most a fifth of the height
		// can buy is 0.89. Big enough that a pixel either way can't tip it over.
		const vee = draw(1000, 1000, (x, y) => y >= 10 && Math.abs(x - 500) < (1000 - y) / 2);
		assert.equal(flatCut(rowSpans(vee)), null);
	});
});

describe('problems', () => {
	it('passes art on a transparent canvas with room around it', () => {
		assert.deepEqual(problems(flat), []);
	});

	it('refuses a painted background', () => {
		assert.deepEqual(problems(draw(50, 50, () => true)), ['the background is not transparent']);
	});

	it('says which side the art runs off', () => {
		assert.deepEqual(problems(draw(100, 100, (x, y) => y < 50 && x > 20 && x < 80)), [
			'it is cut off at the top'
		]);
		assert.deepEqual(problems(draw(100, 100, (x, y) => x > 60 && y > 20 && y < 80)), [
			'it is cut off on the right'
		]);
	});
});
