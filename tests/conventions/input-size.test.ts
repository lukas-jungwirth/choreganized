/**
 * Every field you type into renders at 16px or more. Below that, Safari on an
 * iPhone zooms the whole page in when the field takes the focus — and leaves it
 * zoomed after — which in a PWA reads as the layout breaking (→ DESIGN-SYSTEM
 * "Type scale", DECISIONS #200, #201). The steps from `--fs-16` up never render
 * under 16px, whatever the reader's text setting (design-tokens.test.ts holds
 * the scale to that), so a field only has to use one of them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { sourceFiles, styleOnly } from '../helpers/source';

const IOS_ZOOM_FLOOR = 16;

describe('type you type into', () => {
	it('every input, textarea and select uses a step of 16px or more', () => {
		const offenders = sourceFiles('src', ['.svelte']).flatMap((file) => {
			const css = styleOnly(file.text);
			return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) => {
				const [, selector, body] = rule;
				if (!/(^|[\s,>+~(])(input|textarea|select)\b/.test(selector)) return [];
				const value = body.match(/font-size\s*:\s*([^;]+)/)?.[1].trim();
				if (!value || value === 'inherit') return [];
				const step = value.match(/^(?:min\()?var\(--fs-(\d+)\)(?:,\s*(\d+)px\))?$/);
				const px = step ? Math.min(Number(step[1]), Number(step[2] ?? Infinity)) : 0;
				if (px >= IOS_ZOOM_FLOOR) return [];
				const line = css.slice(0, rule.index + selector.length).split('\n').length;
				return [`${file.path}:${line} ${selector.trim()} → ${value}`];
			});
		});

		assert.deepEqual(
			offenders,
			[],
			`A field under ${IOS_ZOOM_FLOOR}px makes iOS zoom on focus — use var(--fs-16) or more.`
		);
	});
});
