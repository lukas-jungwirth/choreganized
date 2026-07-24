/**
 * The app's localisation surface (→ docs/ARCHITECTURE.md "Language").
 *
 * In a component:
 *
 * ```svelte
 * <script lang="ts">
 *   import { messages } from '$lib/i18n';
 *   const m = messages();
 * </script>
 * ```
 *
 * On the server, where there is no component context, take the locale from
 * `event.locals.locale` (or a member's own column, for a notification going to
 * someone who isn't making the request) and ask for the catalog directly:
 *
 * ```ts
 * import { catalog } from '$lib/i18n';
 * const m = catalog(locale);
 * ```
 */
export { catalog, type Messages } from './messages';
export { locale, messages, setI18nContext } from './context';
export {
	DEFAULT_LOCALE,
	isLocale,
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
	LOCALE_NAMES,
	LOCALES,
	negotiateLocale,
	type Locale
} from './locale';
