import { describe, expect, it } from 'vitest';
import { EDGE, SWIPE_MIN, fromEdge, neighbour, swipeDirection } from './swipe';

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

describe('neighbour', () => {
	const views = [{ value: 'todo' }, { value: 'history' }];

	it("moves on leftwards and back rightwards, in the options' order", () => {
		expect(neighbour(views, 'todo', 'left')).toBe(views[1]);
		expect(neighbour(views, 'history', 'right')).toBe(views[0]);
	});

	it('goes nowhere past either end, or from a value it does not know', () => {
		expect(neighbour(views, 'todo', 'right')).toBeNull();
		expect(neighbour(views, 'history', 'left')).toBeNull();
		expect(neighbour(views, 'all', 'left')).toBeNull();
		expect(neighbour([], 'todo', 'left')).toBeNull();
	});
});
