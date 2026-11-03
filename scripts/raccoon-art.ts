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
