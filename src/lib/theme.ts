/**
 * What a theme *is* here: light, dark, or "follow the device" (→ SPEC §6).
 *
 * Deliberately free of any Svelte import, so `hooks.server.ts` can read the
 * cookie before a component exists.
 *
 * Unlike language, a theme is **per device and not stored on the membership**
 * (→ DECISIONS #119). Nothing on the server needs to know it — no notification
 * is written in a colour — and a phone read in bed at night and a laptop on a
 * bright desk genuinely want different answers. So the cookie *is* the setting
 * rather than a mirror of one.
 */

/** The two themes the app paints. */
export const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Where the choice lives. A missing cookie is the "System" option, not an
 * absence: it means "follow this device", which is why choosing System *deletes*
 * the cookie rather than writing anything (→ `settings/+page.server.ts`).
 */
export const THEME_COOKIE = 'theme';

/** A year: this is a preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
	return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The handful of colours that have to exist **outside** `app.css`, each as its
 * `[light, dark]` pair — the single source for all three of them
 * (→ DECISIONS #121).
 *
 * Three consumers can't read a custom property and so have to spell colours
 * out: the `theme-color` metas (a `<meta>` has no CSS), the web manifest (it is
 * JSON), and the offline page (it is served precisely when nothing else can be
 * fetched, → DECISIONS #56). They previously each carried their own literals
 * with a comment asking the next editor to keep them aligned, and they promptly
 * drifted — the dark `theme-color` was still cook mode's `#12100D` while `--bg`
 * had become `#191510`, so the status bar sat a shade below the page under it.
 *
 * Hence pairs in one table rather than prose: the mismatch is now unspellable.
 * These still have to track `app.css` by hand — that seam is real and is why
 * the list is kept to the few names that genuinely need it.
 */
export const CHROME = {
	bg: ['#F5F3EE', '#191510'], // --bg
	cookBg: ['#22201C', '#12100D'], // --cook-bg
	ink: ['#22201C', '#EFE9DE'], // --ink
	sunken: ['#EFEBE2', '#15110C'], // --sunken
	muted: ['#8A867E', '#A5A096'], // --text-4
	faint: ['#B7B2A9', '#6E675E'], // --text-disabled
	sage: ['#5F8D72', '#74A585'], // --sage
	onSage: ['#FFFFFF', '#12100D'] // --on-sage
} as const satisfies Record<string, readonly [light: string, dark: string]>;

export type ChromeColor = keyof typeof CHROME;

/** One chrome colour in one theme. */
export function chrome(name: ChromeColor, theme: Theme): string {
	return CHROME[name][theme === 'dark' ? 1 : 0];
}

/**
 * The same pair written as CSS — for a document that follows the device rather
 * than being told (the offline page, which can't read the httpOnly cookie).
 */
export function chromeLightDark(name: ChromeColor): string {
	const [light, dark] = CHROME[name];
	return `light-dark(${light}, ${dark})`;
}

/**
 * The colour behind the status bar. Cook mode is the app's darkest screen in
 * either theme, so it answers for its own canvas (→ SPEC §4.6).
 */
export function themeColor(theme: Theme, cookMode: boolean): string {
	return chrome(cookMode ? 'cookBg' : 'bg', theme);
}

/**
 * What the *device* asked for, from `Sec-CH-Prefers-Color-Scheme`, or null.
 *
 * Not used to paint a page — a client hint only arrives on the *second* request
 * to an origin unless you pay for a `Critical-CH` round trip, so the document
 * itself still answers "follow the device" in CSS (→ hooks.server.ts). But a
 * subresource fetched *after* a page has already been served does get it for
 * free, which is exactly the manifest's situation: it is the one consumer that
 * can neither media-query nor re-render (→ `routes/manifest.webmanifest`).
 *
 * Chromium-only, which is also where an installed PWA's splash screen comes
 * from, so the coverage lands where it matters.
 */
export function hintedTheme(header: string | null | undefined): Theme | null {
	if (header === 'dark') return 'dark';
	if (header === 'light') return 'light';
	return null;
}
