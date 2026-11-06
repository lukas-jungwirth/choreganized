/**
 * Measuring a raccoon's silhouette — shared by `scripts/raccoons.ts`, which
 * checks and cuts a new batch, and `tests/conventions/mascot-perch.test.ts`,
 * which holds the shipped art to the same bar (→ DECISIONS #218, #220).
 *
 * Pure: everything works on raw RGBA pixels, so the script can run it on a
 * master PNG and the test on a shipped AVIF, and its own test on a shape drawn
 * in memory. Standalone like the other scripts — Node runs it as TypeScript.
 */

/** Raw pixels, four channels (`sharp(…).ensureAlpha().raw()`). */
export type Raw = { data: Uint8Array; width: number; height: number };

/** A pixel counts as part of the raccoon from half opacity up. */
const OPAQUE = 128;

/** Below this ratio a perched raccoon's bottom reads as round (→ DECISIONS #218). */
export const FLAT_ENOUGH = 0.8;

/** What a cut aims for: comfortably over the bar, like the poses cut by hand. */
const CUT_TARGET = 0.9;

/** The most a cut may take off the bottom before the pose is better regenerated. */
const MAX_CUT = 0.2;

const alpha = (raw: Raw, x: number, y: number) => raw.data[(y * raw.width + x) * 4 + 3];

/** Opaque width of each row, edge to edge (0 for an empty row). */
export function rowSpans(raw: Raw): number[] {
	const spans: number[] = [];
	for (let y = 0; y < raw.height; y++) {
		let left = -1;
		let right = -1;
		for (let x = 0; x < raw.width; x++) {
			if (alpha(raw, x, y) > OPAQUE) {
				if (left < 0) left = x;
				right = x;
			}
		}
		spans.push(left < 0 ? 0 : right - left + 1);
	}
	return spans;
}

/**
 * How flat the bottom of the first `height` rows is: the width two rows above
 * the bottom (clear of an encoder's soft edge) over the width 3% of the height
 * higher. A straight cut through the body is about 1; a rounded belly, which
 * narrows fast towards the bottom, measured 0.43–0.68.
 */
export function flatness(spans: number[], height = spans.length): number {
	const bottom = height - 3;
	const above = spans[bottom - Math.round(height * 0.03)];
	return above ? spans[bottom] / above : 0;
}

/**
 * How many rows to cut off the bottom so it is flat, in steps of 5: 0 when it
 * already is, `null` when even a fifth of the height wouldn't do — a pose that
 * round wants regenerating, not cropping.
 */
export function flatCut(spans: number[]): number | null {
	const height = spans.length;
	for (let cut = 0; cut <= height * MAX_CUT; cut += 5) {
		if (flatness(spans, height - cut) >= CUT_TARGET) return cut;
	}
	return null;
}

/**
 * What makes a master unusable as it is, before any trimming: a background
 * that isn't transparent, or art running off the top or a side of the canvas
 * (cut off — the bottom is allowed, it gets cut anyway).
 */
export function problems(raw: Raw): string[] {
	const { width, height } = raw;
	const found: string[] = [];
	const corners = [
		[0, 0],
		[width - 1, 0],
		[0, height - 1],
		[width - 1, height - 1]
	];
	if (corners.some(([x, y]) => alpha(raw, x, y) > 16)) {
		found.push('the background is not transparent');
		// Every edge is "touched" by an opaque background; nothing more to learn.
		return found;
	}

	/** More than a couple of opaque pixels along an edge is art, not a stray. */
	const touches = (pixels: Array<[number, number]>) =>
		pixels.filter(([x, y]) => alpha(raw, x, y) > OPAQUE).length > 2;
	const row = (y: number) => Array.from({ length: width }, (_, x) => [x, y] as [number, number]);
	const column = (x: number) =>
		Array.from({ length: height }, (_, y) => [x, y] as [number, number]);

	if (touches(row(0))) found.push('it is cut off at the top');
	if (touches(column(0))) found.push('it is cut off on the left');
	if (touches(column(width - 1))) found.push('it is cut off on the right');
	return found;
}

/**
 * Where the raccoon's body is, across its width (0–1): halfway between the
 * two gold buttons on its overalls, which every pose wears and no prop
 * mimics in pairs. Home sets each pose by this rather than by its picture's
 * edge, so a slim pose and one holding a racket out sit in the same place
 * (→ DECISIONS #224). `null` when the buttons can't both be seen (under a
 * blanket, behind a mug) — then `mascots.json` says it by hand (`body`).
 */
export function bodyCentre(raw: Raw): number | null {
	const { data, width, height } = raw;
	const gold = new Uint8Array(width * height);
	for (let i = 0; i < width * height; i++) {
		const [r, g, b, a] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
		if (a > 200 && r > 170 && g > 120 && b < 120 && r - g < 90 && g - b > 50) gold[i] = 1;
	}

	/** Round, solid, button-sized blobs of gold — a lemon slice, a bell or a candle flame is not one. */
	const buttons: Array<{ x: number; y: number; area: number }> = [];
	const minArea = (height * 0.025) ** 2;
	const seen = new Uint8Array(width * height);
	for (let start = 0; start < gold.length; start++) {
		if (!gold[start] || seen[start]) continue;
		const stack = [start];
		seen[start] = 1;
		let area = 0;
		let sumX = 0;
		let sumY = 0;
		let [left, right, top, bottom] = [width, 0, height, 0];
		while (stack.length) {
			const at = stack.pop()!;
			const x = at % width;
			const y = (at - x) / width;
			area++;
			sumX += x;
			sumY += y;
			[left, right, top, bottom] = [
				Math.min(left, x),
				Math.max(right, x),
				Math.min(top, y),
				Math.max(bottom, y)
			];
			for (const next of [at - 1, at + 1, at - width, at + width]) {
				if (next >= 0 && next < gold.length && gold[next] && !seen[next]) {
					seen[next] = 1;
					stack.push(next);
				}
			}
		}
		const boxWidth = right - left + 1;
		const boxHeight = bottom - top + 1;
		const round = boxWidth / boxHeight > 0.6 && boxWidth / boxHeight < 1.6;
		// A button is a filled disc (a circle fills ~0.79 of its box); a flame
		// or a star is ragged, about half.
		const solid = area / (boxWidth * boxHeight) > 0.55;
		// …and sits on the bib, below the face: candles held up high don't count.
		const low = sumY / area > height * 0.45;
		if (area > minArea && round && solid && low && boxWidth < width * 0.12) {
			buttons.push({ x: sumX / area, y: sumY / area, area });
		}
	}

	/** Two of them side by side: level, alike in size, a bib's width apart. */
	let best: { centre: number; score: number } | null = null;
	for (let i = 0; i < buttons.length; i++) {
		for (let j = i + 1; j < buttons.length; j++) {
			const [a, b] = [buttons[i], buttons[j]];
			const level = Math.abs(a.y - b.y) / height;
			const apart = Math.abs(a.x - b.x) / width;
			const alike = Math.min(a.area, b.area) / Math.max(a.area, b.area);
			if (level < 0.05 && apart > 0.08 && apart < 0.45 && alike > 0.5) {
				const score = alike - level * 5;
				if (!best || score > best.score) best = { centre: (a.x + b.x) / 2 / width, score };
			}
		}
	}
	return best ? Math.round(best.centre * 100) / 100 : null;
}
