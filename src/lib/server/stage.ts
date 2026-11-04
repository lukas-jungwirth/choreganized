/**
 * Which deploy this is: the household's (`live`) or the test environment
 * (`test`), from `APP_STAGE` (→ DECISIONS #236).
 *
 * Both can sit on one phone as installed apps, so the test one wears its own
 * name and a TEST-labelled icon set (`static/icons/test/`, built by
 * `npm run icons`). Anything but `test` is live: a typo or a missing variable
 * must leave the household's app looking like itself, never like the test one.
 *
 * The name is a brand, not copy, so it isn't in the message catalog (like the
 * manifest's `name` always was). The short name is what a home screen prints
 * under the icon: "Haushaltsheld Test" would be cut to "Haushaltsh…".
 */
import { env } from '$env/dynamic/private';

export type Stage = 'live' | 'test';

export type Branding = {
	/** The installed app's full name: manifest `name`, `application-name`. */
	name: string;
	/** Under the icon on a home screen: manifest `short_name`, iOS's title. */
	shortName: string;
	/** Where its icons are, from the site root, no trailing slash. */
	icons: string;
};

export const BRANDING: Record<Stage, Branding> = {
	live: { name: 'Haushaltsheld', shortName: 'Haushaltsheld', icons: '/icons' },
	test: { name: 'Haushaltsheld Test', shortName: 'HH Test', icons: '/icons/test' }
};

/** `APP_STAGE` read leniently: `test` in any case or spacing, else live. */
export function stageFrom(value: string | undefined): Stage {
	return value?.trim().toLowerCase() === 'test' ? 'test' : 'live';
}

/** Resolved per call: `$env/dynamic/private` is empty while the app builds. */
export function branding(): Branding {
	return BRANDING[stageFrom(env.APP_STAGE)];
}

/** The manifest's icons for one set: the store icon and the maskable one, 192 and 512. */
export function manifestIcons(icons: string) {
	return [192, 512].flatMap((size) => [
		{
			src: `${icons}/icon-${size}.png`,
			sizes: `${size}x${size}`,
			type: 'image/png',
			purpose: 'any'
		},
		{
			src: `${icons}/icon-${size}-maskable.png`,
			sizes: `${size}x${size}`,
			type: 'image/png',
			purpose: 'maskable'
		}
	]);
}
