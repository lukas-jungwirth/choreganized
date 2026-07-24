/**
 * How a component gets its words.
 *
 * The root layout puts the request's catalog into Svelte context; every
 * component that says anything pulls it out at init:
 *
 * ```svelte
 * <script lang="ts">
 *   import { messages } from '$lib/i18n';
 *   const m = messages();
 * </script>
 *
 * <h1>{m.settings.title}</h1>
 * ```
 *
 * Context rather than a module-level variable because the server renders many
 * households at once and a shared `let locale` would leak one member's language
 * into another's page — the same reason SvelteKit's own `page` is context-bound.
 *
 * **The catalog is a snapshot, not a subscription.** `m` is whichever frozen
 * object the request resolved to, so `const label = m.tasks.title` in a script
 * is as valid as reading it in markup. That holds because switching language is
 * a *document* load, never a client-side data update: `<html lang>`, the `Intl`
 * formatter caches and every server-rendered string have to change together, so
 * the switcher posts a plain form and lets the browser navigate (→ SPEC §6).
 * The root layout asserts the invariant rather than trusting it.
 */
import { getContext, setContext } from 'svelte';
import { catalog, type Messages } from './messages';
import { DEFAULT_LOCALE, type Locale } from './locale';

const I18N_KEY = Symbol('i18n');

type I18nContext = { locale: Locale; m: Messages };

/** Root layout only — once per request, from `+layout.server.ts`'s `locale`. */
export function setI18nContext(locale: Locale): void {
	setContext<I18nContext>(I18N_KEY, { locale, m: catalog(locale) });
}

/**
 * This request's catalog. Call at component init (it reads context), then read
 * from it wherever you like.
 */
export function messages(): Messages {
	return current().m;
}

/** This request's language — for `Intl` and for the switcher's own checkmark. */
export function locale(): Locale {
	return current().locale;
}

/**
 * Falling back rather than throwing keeps a component usable outside the app
 * shell — an error page rendered before the layout ran, a component mounted in
 * isolation — where being wordless would be worse than being English.
 */
function current(): I18nContext {
	return (
		getContext<I18nContext | undefined>(I18N_KEY) ?? {
			locale: DEFAULT_LOCALE,
			m: catalog(DEFAULT_LOCALE)
		}
	);
}
