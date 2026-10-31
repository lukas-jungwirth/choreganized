/**
 * A horizontal swipe as a shortcut for something a control already does — the
 * Cooking tab's two weeks (→ SPEC §4.1, DECISIONS #206). Never the only way:
 * the control stays, and the swipe just presses it.
 *
 * Touch and pen only. A mouse drag over the same area is selecting text, and
 * desktop has the buttons right there.
 */

/** How far the finger must travel sideways before it counts, in CSS px. */
export const SWIPE_MIN = 60;

/**
 * Sideways must beat downwards by this much, so a scroll that drifts doesn't
 * page the week out from under the reader.
 */
export const SWIPE_RATIO = 2;

/**
 * A touch that starts this close to either edge of the screen belongs to the
 * system — iOS and Android both page *back* on an edge swipe.
 */
export const EDGE = 24;

export type SwipeDirection = 'left' | 'right';

/**
 * What a finished gesture was: `left` when the finger travelled leftwards
 * (the content would move on to what comes next), `right` back, `null` when it
 * was a tap, a scroll, or too short to mean anything.
 */
export function swipeDirection(dx: number, dy: number): SwipeDirection | null {
	if (Math.abs(dx) < SWIPE_MIN) return null;
	if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null;
	return dx < 0 ? 'left' : 'right';
}

/** Whether a touch starting at `x` on a screen `width` wide is the system's. */
export function fromEdge(x: number, width: number): boolean {
	return x < EDGE || x > width - EDGE;
}

/**
 * `use:swipe={(direction) => …}` on the area that pages. It sets
 * `touch-action: pan-y pinch-zoom` there, so the browser keeps vertical
 * scrolling and zoom but hands sideways travel to us instead of cancelling
 * the pointer. A swipe that ends on a row eats the click that would follow,
 * so paging never also opens a sheet.
 */
export function swipe(node: HTMLElement, onswipe: (direction: SwipeDirection) => void) {
	let handler = onswipe;
	let pointer: number | null = null;
	let startX = 0;
	let startY = 0;

	node.style.touchAction = 'pan-y pinch-zoom';

	function down(event: PointerEvent) {
		// A fresh touch is a fresh tap: whatever the last swipe armed is spent.
		disarm();
		if (event.pointerType === 'mouse') return;
		// A second finger is a pinch, not a swipe.
		if (pointer !== null) {
			pointer = null;
			return;
		}
		if (fromEdge(event.clientX, window.innerWidth)) return;
		pointer = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
	}

	function up(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		pointer = null;
		const direction = swipeDirection(event.clientX - startX, event.clientY - startY);
		if (!direction) return;
		swallowClick();
		handler(direction);
	}

	function cancel(event: PointerEvent) {
		if (event.pointerId === pointer) pointer = null;
	}

	/**
	 * The click a lifted finger may still fire on the row it ended over. Armed
	 * until it eats that click, the next touch begins, or 400 ms pass — a moved
	 * touch often fires no click at all, and a tap after the swipe must land.
	 */
	let armed: { eat: (event: MouseEvent) => void; timer: ReturnType<typeof setTimeout> } | null =
		null;

	function swallowClick() {
		disarm();
		const eat = (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			disarm();
		};
		node.addEventListener('click', eat, { capture: true });
		armed = { eat, timer: setTimeout(disarm, 400) };
	}

	function disarm() {
		if (!armed) return;
		node.removeEventListener('click', armed.eat, { capture: true });
		clearTimeout(armed.timer);
		armed = null;
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);

	return {
		update(next: (direction: SwipeDirection) => void) {
			handler = next;
		},
		destroy() {
			disarm();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
		}
	};
}
