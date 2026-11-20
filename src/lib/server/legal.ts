/**
 * The Impressum and Datenschutz texts (→ SPEC §13, DECISIONS #268).
 *
 * They are the operator's words, not the app's: whoever runs a deploy sets
 * `LEGAL_IMPRINT` and `LEGAL_PRIVACY`, and the pages show them as written in
 * every UI language — so they are not in the message catalog, like household
 * content. A page exists only while its variable has text in it, and every link
 * to it hides otherwise, the way email sign-in hides with no mail settings
 * (→ `mail.ts`): someone else's install must never show this one's address.
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

export function legalText(page: LegalPage): string | null {
	return legalTextFrom(env, page);
}

/** Which pages exist — what sign-in, the invite landing and Settings ask. */
export function legalLinks(): LegalLinks {
	return legalLinksFrom(env);
}
