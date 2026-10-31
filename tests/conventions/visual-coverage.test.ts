/**
 * Every screen has a picture (→ docs/TESTING.md "Visual"). The visual suite only
 * guards the screens it lists, so a new page with no entry there could change
 * its look forever and nothing would notice — which is how import, new recipe,
 * stores, the four onboarding steps and the invite landing went unguarded until
 * 2026-10-25. Each entry in
 * `tests/visual/screens.ts` names the route it shows (`route:`), and this
 * test holds that list against `src/routes`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { sourceFiles } from '../helpers/source';

const SPEC = 'tests/visual/screens.ts';

/** Pages with no screenshot on purpose. Every addition needs a reason here. */
const NOT_SCREENSHOTTED: Record<string, string> = {
	// Its load always redirects (login, onboarding or home); the page never paints.
	'/': 'always redirects'
};

/** `src/routes/(app)/cooking/+page.svelte` → `/(app)/cooking`, SvelteKit's route id. */
function routeId(path: string): string {
	return path.replace(/^src\/routes/, '').replace(/\/\+page\.svelte$/, '') || '/';
}

function screenshotted(): Set<string> {
	const spec = readFileSync(SPEC, 'utf8');
	return new Set(Array.from(spec.matchAll(/\broute: '([^']+)'/g), (match) => match[1]));
}

describe('visual coverage', () => {
	const pages = sourceFiles('src/routes', ['+page.svelte']).map((file) => routeId(file.path));

	it('every page is in the visual suite, unless listed here with a reason', () => {
		const shown = screenshotted();
		const missing = pages.filter((route) => !shown.has(route) && !(route in NOT_SCREENSHOTTED));
		assert.deepEqual(
			missing,
			[],
			`Add a screen with \`route: '<id>'\` to ${SPEC} (and its baseline via \`npm run test:visual -- --update-snapshots\`), or list the route in NOT_SCREENSHOTTED with the reason.`
		);
	});

	it('names only routes that exist', () => {
		const known = new Set(pages);
		const stale = [...screenshotted(), ...Object.keys(NOT_SCREENSHOTTED)].filter(
			(route) => !known.has(route)
		);
		assert.deepEqual(stale, [], 'A renamed or deleted page — update its route id.');
	});

	it('an excused page is not also screenshotted', () => {
		const shown = screenshotted();
		const both = Object.keys(NOT_SCREENSHOTTED).filter((route) => shown.has(route));
		assert.deepEqual(both, [], 'It has a picture now — take it off NOT_SCREENSHOTTED.');
	});
});
