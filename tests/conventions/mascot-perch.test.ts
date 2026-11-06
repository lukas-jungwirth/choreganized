/**
 * A raccoon that sits on a card's top edge is cut flat at the waist
 * (→ DECISIONS #213, #218). The card hides only its bottom 2px, so a master
 * whose belly rounds off shows a curve resting on a straight edge, and the
 * raccoon looks like it is floating. Generated art often comes that way; this
 * reads the AVIFs `npm run icons` ships and fails on any that does.
 *
 * Flat means the row just above the cut is about as wide as a row 3% of the
 * height higher up — the measure `npm run raccoons` cuts new art by
 * (`scripts/raccoon-art.ts`). A rounded belly narrows fast towards the
 * bottom: the poses that came in rounded measured 0.43–0.68 before they were
 * cut, the flat ones measure 0.87 and up. Which raccoons are perched is
 * `artwork/raccoon/mascots.json` (→ DECISIONS #220); title raccoons
 * (`PageHeader`) and `head` stand beside their text rather than on a card, so
 * they are not held to this.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, it } from 'vitest';
import type { MascotName } from '$lib/assets/mascot';
import { PERCHED } from '$lib/assets/mascot/everyday';
import { FLAT_ENOUGH, flatness, rowSpans } from '../../scripts/raccoon-art.ts';

async function flatnessOf(name: MascotName): Promise<number> {
	const file = readFileSync(`src/lib/assets/mascot/${name}.avif`);
	const { data, info } = await sharp(file)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	return flatness(rowSpans({ data, width: info.width, height: info.height }));
}

describe('perched raccoons', () => {
	for (const name of PERCHED) {
		it(`${name} is cut flat at the bottom`, async () => {
			const ratio = await flatnessOf(name);
			assert.ok(
				ratio >= FLAT_ENOUGH,
				`${name}: bottom row is ${ratio.toFixed(2)}× the width 3% higher — cut the master flat (artwork/raccoon/README.md)`
			);
		});
	}
});
