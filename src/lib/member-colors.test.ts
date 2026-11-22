import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { leastUsedColor, MAX_MEMBERS, MEMBER_COLORS } from './member-colors';

const ALL = MEMBER_COLORS.map((color) => color.value);
const [sage, terracotta, blue] = ALL;

describe('leastUsedColor (a guest’s colour, → SPEC §11.15)', () => {
	it('takes the first colour nobody wears', () => {
		assert.equal(leastUsedColor([sage, terracotta]), blue);
		assert.equal(leastUsedColor([]), sage);
	});

	it('reads colours whatever their case', () => {
		assert.equal(leastUsedColor([sage.toLowerCase(), terracotta.toLowerCase()]), blue);
	});

	it('with every colour worn, picks the least worn, ties in palette order', () => {
		assert.equal(leastUsedColor([...ALL, sage, terracotta]), blue);
		assert.equal(leastUsedColor(ALL), sage);
	});
});

describe('the palette (one colour per member, → SPEC §1.5)', () => {
	it('has eight distinct colours, so a household holds eight people', () => {
		assert.equal(MAX_MEMBERS, 8);
		assert.equal(new Set(MEMBER_COLORS.map((color) => color.value.toUpperCase())).size, 8);
		assert.equal(new Set(MEMBER_COLORS.map((color) => color.key)).size, 8);
	});

	it('mirrors a `--member-<key>` token in app.css for every colour', () => {
		const css = readFileSync('src/app.css', 'utf8');
		for (const { key, value } of MEMBER_COLORS) {
			const token = css.match(new RegExp(`--member-${key}:\\s*(#[0-9a-fA-F]{6});`))?.[1];
			assert.equal(token?.toUpperCase(), value, `--member-${key}`);
		}
	});
});
