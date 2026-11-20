/**
 * The Impressum and Datenschutz texts (→ SPEC §13, DECISIONS #270).
 *
 * They are the operator's words, not the app's: whoever runs a deploy sets
 * `LEGAL_IMPRINT` and `LEGAL_PRIVACY`, and the pages show them as written in
 * every UI language — so they are not in the message catalog, like household
 * content. A page exists only while its variable has text in it, and every link
 * to it hides otherwise, the way email sign-in hides with no mail settings
 * (→ `mail.ts`): someone else's install must never show this one's address.
 * `LEGAL_LANG` says which language they are written in (German by default).
 *
 * Read per call: `$env/dynamic/private` is empty while the app builds, and a
 * restarted container with new values needs no new build.
 */
import { env } from '$env/dynamic/private';
import type { LegalLinks, LegalPage } from '$lib/utils/legal';

const VARIABLE: Record<LegalPage, string> = {
	imprint: 'LEGAL_IMPRINT',
	privacy: 'LEGAL_PRIVACY'
};

type LegalEnv = Record<string, string | undefined>;

/** One page's text, or null while it isn't set — pure, so the rule is testable. */
export function legalTextFrom(vars: LegalEnv, page: LegalPage): string | null {
	// `\n` typed as two characters counts as blank too: it is a line break.
	const text = vars[VARIABLE[page]];
	return text && text.replace(/\\n/g, '\n').trim() ? text : null;
}

export function legalLinksFrom(vars: LegalEnv): LegalLinks {
	return {
		imprint: legalTextFrom(vars, 'imprint') !== null,
		privacy: legalTextFrom(vars, 'privacy') !== null
	};
}

/** A language tag as HTML's `lang` takes it: "de", "en", "de-AT". */
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * The language both texts are written in, for the `lang` on the page's text:
 * the UI may be English while the Impressum is German, and a screen reader
 * pronounces by `lang`. `LEGAL_LANG`, German when unset or not a tag: an
 * Impressum is a German-language duty, and the one deploy there is writes
 * German, so it has nothing to set (→ DECISIONS #281).
 */
export function legalLangFrom(vars: LegalEnv): string {
	const lang = vars.LEGAL_LANG?.trim();
	return lang && LANGUAGE_TAG.test(lang) ? lang : 'de';
}

export function legalLang(): string {
	return legalLangFrom(env);
}

export function legalText(page: LegalPage): string | null {
	return legalTextFrom(env, page);
}

/** Which pages exist — what sign-in, the invite landing and Settings ask. */
export function legalLinks(): LegalLinks {
	return legalLinksFrom(env);
}
