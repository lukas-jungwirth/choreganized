/**
 * The web manifest, served rather than static, so an installed app doesn't
 * launch into the wrong colour (→ SPEC §10, DECISIONS #121).
 *
 * `background_color` paints the **splash screen** — the frame between tapping
 * the icon and the first byte of CSS — and it is the one colour in the app with
 * no runtime override at all: `<meta name="theme-color">` can supersede the
 * manifest's `theme_color`, but nothing supersedes `background_color`. Left at
 * the cream literal it used to be, every cold start on a dark phone opened with
 * a full-screen flash of #F5F3EE, which is exactly the failure the offline page
 * goes out of its way to avoid.
 *
 * Manifests can't media-query and can't re-render, so the theme has to be known
 * *here*, per request:
 *
 * 1. **The cookie**, when someone has pinned a theme — the same one the document
 *    is stamped from (→ hooks.server.ts). Only arrives because the `<link>`
 *    carries `crossorigin="use-credentials"`: a manifest fetch omits credentials
 *    by default, so without it this would always look signed-out (→ app.html).
 * 2. **`Sec-CH-Prefers-Color-Scheme`**, for everyone on "System". The hint is
 *    dismissed for the *document* (it needs a `Critical-CH` round trip to arrive
 *    on a first visit, → hooks.server.ts) but a manifest is fetched *after* a
 *    page has already been served, so it comes for free. Chromium-only — which
 *    is also where the splash screen comes from, so it covers the case.
 * 3. **Light**, the app's own default.
 *
 * A stale answer is self-correcting: browsers re-fetch the manifest, and the
 * worst case is one launch in the previous theme.
 */
import { branding, manifestIcons } from '$lib/server/stage';
import { chrome, hintedTheme, isTheme, THEME_COOKIE, type Theme } from '$lib/theme';
import type { RequestHandler } from './$types';

/**
 * Everything about the app that has nothing to do with the theme or the deploy.
 * The name and the icons are the deploy's: the test environment's are its own,
 * so the two installed apps can be told apart (→ `$lib/server/stage`).
 */
const MANIFEST = {
	id: '/',
	description: 'Every chore, organized. Shopping, meal plan and chores for your household.',
	start_url: '/home',
	scope: '/',
	display: 'standalone',
	orientation: 'portrait',
	lang: 'en',
	dir: 'ltr',
	categories: ['lifestyle', 'productivity'],
	share_target: {
		action: '/cooking/recipes/import',
		method: 'GET',
		params: { url: 'url', text: 'text', title: 'title' }
	}
};

export const GET: RequestHandler = (event) => {
	const cookie = event.cookies.get(THEME_COOKIE);
	const theme: Theme =
		(isTheme(cookie) ? cookie : null) ??
		hintedTheme(event.request.headers.get('sec-ch-prefers-color-scheme')) ??
		'light';
	const brand = branding();

	return new Response(
		JSON.stringify({
			...MANIFEST,
			name: brand.name,
			short_name: brand.shortName,
			icons: manifestIcons(brand.icons),
			background_color: chrome('bg', theme),
			theme_color: chrome('bg', theme)
		}),
		{
			headers: {
				'content-type': 'application/manifest+json',
				// Per-user *and* per-device, so a shared cache would hand one household
				// member the other's splash screen. Short-lived rather than `no-store`:
				// this is refetched on every install check, and it changes about twice
				// a year.
				'cache-control': 'private, max-age=300',
				vary: 'Cookie, Sec-CH-Prefers-Color-Scheme'
			}
		}
	);
};
