import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { leastUsedColor, MEMBER_COLORS } from './member-colors';

const [sage, terracotta, blue, amber, plum] = MEMBER_COLORS.map((color) => color.value);

describe('leastUsedColor (a guest’s colour, → SPEC §11.15)', () => {
	it('takes the first colour nobody wears', () => {
		assert.equal(leastUsedColor([sage, terracotta]), blue);
		assert.equal(leastUsedColor([]), sage);
	});

	it('reads colours whatever their case', () => {
		assert.equal(leastUsedColor([sage.toLowerCase(), terracotta.toLowerCase()]), blue);
	});

	it('with every colour worn, picks the least worn, ties in palette order', () => {
		assert.equal(leastUsedColor([sage, terracotta, blue, amber, plum, sage, terracotta]), blue);
		assert.equal(leastUsedColor([sage, terracotta, blue, amber, plum]), sage);
	});
});
