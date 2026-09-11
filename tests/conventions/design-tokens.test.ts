/**
 * The two styling rules from CLAUDE.md, as tests (→ DESIGN-SYSTEM "Tokens",
 * "Type scale", DECISIONS #125): every colour is a token from app.css, and every
 * font-size goes through the `--fs` scale. Each failure prints `path:line`, so
 * the fix is one edit away.
 */
import assert from 'node:assert/strict';
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
 * avatar's initial is 38% of the avatar, whatever the avatar is — scaling it by
 * `--fs` too would let the letter outgrow its circle. Every entry needs a reason.
 */
const PROPORTIONAL_TYPE = ['src/lib/components/ui/Avatar.svelte'];

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

	it('every font-size goes through the type scale', () => {
		const offenders = stylesheets
			.filter((file) => !PROPORTIONAL_TYPE.includes(file.path))
			.flatMap((file) =>
				linesMatching(file, /font-size\s*:/).filter(
					(line) => !/calc\([^)]*var\(--fs\)/.test(line) && !/font-size\s*:\s*inherit/.test(line)
				)
			);

		assert.deepEqual(
			offenders,
			[],
			'Write `font-size: calc(<mockup px> * var(--fs))` (→ DESIGN-SYSTEM "Type scale").'
		);
	});
});
