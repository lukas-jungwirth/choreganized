import { describe, expect, it } from 'vitest';
import { EDGE, SWIPE_MIN, fromEdge, swipeDirection } from './swipe';

describe('swipeDirection', () => {
	it('reads a leftward travel as left and a rightward one as right', () => {
		expect(swipeDirection(-120, 10)).toBe('left');
		expect(swipeDirection(120, -10)).toBe('right');
	});

	it('ignores a tap and a short nudge', () => {
		expect(swipeDirection(0, 0)).toBeNull();
		expect(swipeDirection(SWIPE_MIN - 1, 0)).toBeNull();
		expect(swipeDirection(-(SWIPE_MIN - 1), 0)).toBeNull();
		expect(swipeDirection(SWIPE_MIN, 0)).toBe('right');
	});

	it('leaves a scroll that drifts sideways alone', () => {
		expect(swipeDirection(-80, 300)).toBeNull();
		// Sideways has to be at least twice the downward travel.
		expect(swipeDirection(-100, 51)).toBeNull();
		expect(swipeDirection(-100, 50)).toBe('left');
	});
});

describe('fromEdge', () => {
	it('gives a touch at either edge to the system', () => {
		expect(fromEdge(EDGE - 1, 390)).toBe(true);
		expect(fromEdge(390 - EDGE + 1, 390)).toBe(true);
		expect(fromEdge(195, 390)).toBe(false);
	});
});
