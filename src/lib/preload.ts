/**
 * How eagerly a link may preload its page's data (→ DECISIONS #231).
 *
 * The app preloads on hover (`data-sveltekit-preload-data="hover"` in
 * app.html), which runs the target's `load` early. That is free for a load
 * that only reads. These loads also write, on purpose: Home records the
 * raccoon you met, and the raccoon album clears its "New" badges. A hover that never turns into a visit
 * would spend both, so links to them preload on tap instead, a moment before
 * the navigation the press is already starting.
 */
const WRITES_ON_LOAD = ['/home', '/settings/raccoons'];

export function preloadData(href: string): 'tap' | undefined {
	const path = href.split(/[?#]/)[0];
	return WRITES_ON_LOAD.includes(path) ? 'tap' : undefined;
}
