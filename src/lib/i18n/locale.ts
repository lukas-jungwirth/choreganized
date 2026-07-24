/**
 * What a language *is* here: the two-letter tag, how it names itself, and how
 * a browser's `Accept-Language` header is turned into one (→ DECISIONS #8).
 *
 * Deliberately free of any message or any Svelte import, so the negotiation
 * below can run in `hooks.server.ts` before a component exists, and the type
 * can be named from the schema without pulling a catalog into the server
 * bundle.
 */

/** Every language the app ships. Adding one is: extend this, add a catalog. */
export const LOCALES = ['en', 'de'] as const;

export type Locale = (typeof LOCALES)[number];

/** What an unnegotiable request gets — and what the copy is authored in. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Where a chosen language is remembered on the device. A member's choice is
 * stored on their membership as well, but the cookie is what a *signed-out*
 * screen (login, an invite link) has to go on, and what makes the very first
 * paint after a switch already correct (→ `hooks.server.ts`).
 */
export const LOCALE_COOKIE = 'locale';

/** A year: this is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** How each language names itself — never translated (→ SPEC §6). */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	de: 'Deutsch'
};

/**
 * The BCP-47 tag `Intl` gets for each language — month names, weekday names,
 * number grouping.
 *
 * German is **Austrian**: this household is in Vienna, and the one place the tag
 * makes a difference to anything this app shows is the first month of the year —
 * "Jänner"/"Jän." rather than "Januar"/"Jan.". Everything else (weekday names,
 * every other month, "14. Juli") is identical between the two.
 *
 * The *key* stays `de`, because it names a language and that is what the column,
 * the cookie and the switcher speak. Only the rendering tag is regional, which
 * is why these are separate tables.
 */
export const INTL_LOCALE: Record<Locale, string> = {
	en: 'en-US',
	de: 'de-AT'
};

/**
 * The same languages, asked for a day-first date order.
 *
 * English is the reason this exists: the design writes the shorthand
 * American-style ("Jul 14" [4d]) and the history feed's stamp British-style
 * ("Mon 14 Jul" [8a]), and `Intl` takes the order from the tag. German writes
 * "14. Juli" either way, so it maps to itself.
 */
export const INTL_LOCALE_DAY_FIRST: Record<Locale, string> = {
	en: 'en-GB',
	de: 'de-AT'
};

/**
 * The `<html lang>` of a page — the tag a screen reader picks a voice from, so
 * it carries the region where we have one: `de-AT` gets an Austrian voice, and
 * degrades to German anywhere that tag isn't installed.
 */
export const HTML_LANG: Record<Locale, string> = {
	en: 'en',
	de: 'de-AT'
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best language for an `Accept-Language` header, or `null` when it asks for
 * nothing we speak — the caller decides what "nothing" means, which is not
 * always `DEFAULT_LOCALE` (→ `hooks.server.ts` tries the cookie first).
 *
 * "de-AT,de;q=0.9,en-US;q=0.8" → `de`: entries are ranked by quality, ties keep
 * the header's own order (RFC 9110 §12.5.4), and each is matched on its
 * language subtag so a regional dialect still finds its language. `q=0` is a
 * refusal, not a weak preference, so those drop out entirely.
 *
 * `*` is considered only after every named tag, whatever weight it carries: it
 * means "anything else you have", so honouring it by rank would answer
 * "de;q=0.5, *;q=0.9" in English despite German being both asked for and
 * spoken.
 */
export function negotiateLocale(header: string | null | undefined): Locale | null {
	if (!header) return null;

	const ranked = header
		.split(',')
		.map((entry, order) => {
			const [tag, ...params] = entry.split(';');
			const quality = params
				.map((param) => param.trim())
				.find((param) => param.startsWith('q='))
				?.slice(2);

			return {
				tag: tag.trim().toLowerCase(),
				// A malformed weight is a broken header, not a preference — drop it.
				quality: quality === undefined ? 1 : Number(quality),
				order
			};
		})
		.filter((entry) => entry.tag && Number.isFinite(entry.quality) && entry.quality > 0)
		.sort((a, b) => b.quality - a.quality || a.order - b.order);

	for (const { tag } of ranked) {
		if (tag === '*') continue;

		const language = tag.split('-')[0];
		const match = LOCALES.find((locale) => locale === language);
		if (match) return match;
	}

	// Nothing named matched, so a wildcard — at any weight — is what's left.
	return ranked.some((entry) => entry.tag === '*') ? DEFAULT_LOCALE : null;
}
