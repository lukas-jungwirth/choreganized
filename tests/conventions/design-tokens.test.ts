/**
 * The two styling rules from CLAUDE.md, as tests (→ DESIGN-SYSTEM "Tokens",
 * "Type scale", DECISIONS #201): every colour is a token from app.css, and every
 * font-size is a step of the `--fs-*` scale — which itself keeps the rules it
 * promises. Each failure prints `path:line`, so the fix is one edit away.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import {
	linesMatching,
	sourceFiles,
	stripCss,
	styleOnly,
	type SourceFile
} from '../helpers/source';

/**
 * Sizes that are a *proportion of a box*, not a step on the type scale. The
 * avatar's initial is 38% of the avatar, whatever the avatar is — scaling it with
 * the reader's text size too would let the letter outgrow its circle. Every
 * entry needs a reason.
 */
const PROPORTIONAL_TYPE = ['src/lib/components/ui/Avatar.svelte'];

/**
 * A font-size is a step of the scale, `var(--fs-N)`, or — for text in a box that
 * can't grow with it (a badge, a tab bar, seven columns) — that step stopped
 * lower: `min(var(--fs-N), <px>)`, never below the step's own default.
 */
const STEP = /^var\(--fs-(\d+)\)$/;
const CAPPED_STEP = /^min\(var\(--fs-(\d+)\),\s*(\d+)px\)$/;

/** `--fs-N` → its definition, from app.css. */
const scale = new Map(
	Array.from(readFileSync('src/app.css', 'utf8').matchAll(/--fs-(\d+):\s*([^;]+);/g), (match) => [
		Number(match[1]),
		match[2].trim()
	])
);

/** Every stylesheet in the app except the one that *defines* the tokens. */
const stylesheets: SourceFile[] = [
	...sourceFiles('src', ['.svelte']).map((file) => ({ ...file, text: styleOnly(file.text) })),
	...sourceFiles('src', ['.css'])
		.filter((file) => !file.path.endsWith('app.css'))
		.map((file) => ({ ...file, text: stripCss(file.text) }))
];

describe('design tokens', () => {
	it('no hardcoded colour outside app.css', () => {
		const offenders = stylesheets.flatMap((file) =>
			linesMatching(file, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/)
		);

		assert.deepEqual(
			offenders,
			[],
			'Colours are `var(--…)` tokens from src/app.css. Add a token there instead.'
		);
	});

	it('every font-size is a step of the type scale', () => {
		const offenders = stylesheets
			.filter((file) => !PROPORTIONAL_TYPE.includes(file.path))
			.flatMap((file) =>
				linesMatching(file, /font-size\s*:/).filter((line) => {
					const value = line.match(/font-size\s*:\s*([^;]+);?/)?.[1].trim() ?? '';
					if (value === 'inherit') return false;
					const step = value.match(STEP) ?? value.match(CAPPED_STEP);
					if (!step || !scale.has(Number(step[1]))) return true;
					return step[2] !== undefined && Number(step[2]) < Number(step[1]);
				})
			);

		assert.deepEqual(
			offenders,
			[],
			'Write `font-size: var(--fs-<px>)` with a step from src/app.css, or `min(var(--fs-<px>), <cap>px)` for text in a box that cannot grow (→ DESIGN-SYSTEM "Type scale").'
		);
	});

	it('the scale keeps its own rules', () => {
		assert.ok(scale.size > 0, 'no --fs-* steps found in src/app.css');
		const broken = [...scale].flatMap(([px, value]) => {
			// Grows with the reader's setting up to twice itself, but past 48px
			// only if it starts there; body size and up never under 16px.
			const cap = Math.max(px, Math.min(2 * px, 48));
			const grows = `calc(${px} * var(--fs-px))`;
			const expected = px >= 16 ? `clamp(16px, ${grows}, ${cap}px)` : `min(${grows}, ${cap}px)`;
			return value === expected ? [] : [`--fs-${px}: ${value}  (expected ${expected})`];
		});

		assert.deepEqual(
			broken,
			[],
			'A step of the type scale broke its rule (→ app.css "The type scale").'
		);
	});
});
