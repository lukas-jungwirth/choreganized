/**
 * The catalogs, by language. `en.ts` is the schema (→ its header); every other
 * file in here is typed against it, so the set is complete by construction — a
 * *key* can never be missing. `catalog()` still guards the lookup itself, which
 * is a different question (→ its comment).
 */
import { de } from './de';
import { en, type Messages } from './en';
import { DEFAULT_LOCALE, type Locale } from '../locale';

export type { Messages };

const CATALOGS: Record<Locale, Messages> = { en, de };

/**
 * This request's words. Components reach them through `messages()`.
 *
 * Total on purpose. The parameter is typed, but this is called from server code
 * reading `event.locals.locale`, and a `handle` path that returns before setting
 * it would otherwise hand back `undefined` — turning every `m.…` after it into a
 * TypeError rather than an English page.
 */
export function catalog(locale: Locale): Messages {
	return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}
