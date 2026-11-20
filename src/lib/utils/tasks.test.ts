/**
 * What each person gets for a task done together (→ SPEC §5.4, DECISIONS #277).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { splitPoints } from './tasks';

describe('splitPoints', () => {
	it('gives one person the whole task', () => {
		assert.equal(splitPoints(20, 1), 20);
	});

	it('splits evenly when it divides', () => {
		assert.equal(splitPoints(20, 2), 10);
		assert.equal(splitPoints(40, 5), 8);
	});

	it('rounds to the nearest whole point', () => {
		assert.equal(splitPoints(20, 3), 7); // 6.67
		assert.equal(splitPoints(10, 3), 3); // 3.33
		assert.equal(splitPoints(5, 2), 3); // 2.5 rounds up
	});

	it('never lets helping score nothing', () => {
		assert.equal(splitPoints(1, 5), 1);
	});

	it('keeps a 0-point chore at 0', () => {
		assert.equal(splitPoints(0, 3), 0);
	});
});
