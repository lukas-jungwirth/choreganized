/**
 * Every field you type into renders at 16px or more. Below that, Safari on an
 * iPhone zooms the whole page in when the field takes the focus — and leaves it
 * zoomed after — which in a PWA reads as the layout breaking (→ DESIGN-SYSTEM
 * "Type scale", DECISIONS #200). The rendered size is the mockup's px times
 * `--fs`, so the floor moves with the scale token.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { sourceFiles, styleOnly } from '../helpers/source';

const IOS_ZOOM_FLOOR = 16;

const fs = Number(readFileSync('src/app.css', 'utf8').match(/--fs:\s*([\d.]+)/)?.[1]);

describe('type you type into', () => {
	it('reads the scale token', () => assert.ok(fs > 0, '--fs not found in src/app.css'));

	it('every input, textarea and select renders at 16px or more', () => {
		const offenders = sourceFiles('src', ['.svelte']).flatMap((file) => {
			const css = styleOnly(file.text);
			return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) => {
				const [, selector, body] = rule;
				if (!/(^|[\s,>+~(])(input|textarea|select)\b/.test(selector)) return [];
				const px = body.match(/font-size\s*:\s*calc\(\s*([\d.]+)px/)?.[1];
				if (!px || Number(px) * fs >= IOS_ZOOM_FLOOR) return [];
				const line = css.slice(0, rule.index + selector.length).split('\n').length;
				return [`${file.path}:${line} ${selector.trim()} → ${(Number(px) * fs).toFixed(1)}px`];
			});
		});

		assert.deepEqual(
			offenders,
			[],
			`A field under ${IOS_ZOOM_FLOOR}px makes iOS zoom on focus — use calc(15px * var(--fs)) or more.`
		);
	});
});
