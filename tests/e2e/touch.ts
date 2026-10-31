/**
 * A finger travelling across the screen, as real touch input through the
 * DevTools protocol — so `touch-action`, the browser's own pan and the click
 * after a lifted finger all behave as on a phone (→ `$lib/swipe`). Shared by
 * the swipes on Cooking (#84) and Tasks (#87).
 */
import type { Locator, Page } from '@playwright/test';

/**
 * `dx`/`dy` are the travel from the middle of `target`, or from `startX`
 * across its middle. One CDP session for the whole test: a session per
 * gesture loses the later swipes.
 */
export function finger(page: Page) {
	const session = page.context().newCDPSession(page);
	return async (target: Locator, dx: number, dy = 0, startX?: number) => {
		const cdp = await session;
		const box = (await target.boundingBox())!;
		const x = startX ?? box.x + box.width / 2;
		const y = box.y + box.height / 2;
		const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', px: number, py: number) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }]
			});
		await touch('touchStart', x, y);
		for (let step = 1; step <= 8; step++) {
			await touch('touchMove', x + (dx * step) / 8, y + (dy * step) / 8);
		}
		await touch('touchEnd', x + dx, y + dy);
	};
}
