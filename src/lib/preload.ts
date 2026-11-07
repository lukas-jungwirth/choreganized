/**
 * How eagerly a link may preload its page's data (→ DECISIONS #231).
 *
 * The app preloads on hover (`data-sveltekit-preload-data="hover"` in
 * app.html), which runs the target's `load` early. That is free for a load
 * that only reads. These loads also write, on purpose, and a hover that never
 * turns into a visit would spend what they write:
 *
 * - Home records the raccoon you met. It preloads on tap, a moment before the
 *   navigation the press is already starting. A tap is a touchstart, so a finger
 *   starting a scroll can run it, which at worst meets the raccoon on your Home.
 * - The album clears its "New" badges, the ones Home's card waits on. A scroll
 *   starting on a link to it would use them up unseen, so it never preloads
 *   (→ DECISIONS #247).
 */
const WRITES_ON_LOAD: Readonly<Record<string, 'tap' | 'off'>> = {
	'/home': 'tap',
	'/settings/raccoons': 'off'
};

export function preloadData(href: string): 'tap' | 'off' | undefined {
	return WRITES_ON_LOAD[href.split(/[?#]/)[0]];
}
