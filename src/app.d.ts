// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * Populated by hooks.server.ts (plan 00-foundation):
			 * Better Auth session user, or null when signed out.
			 */
			user: { id: string; name: string; email: string; image?: string | null } | null;
			/**
			 * The signed-in user's household membership, or null if they haven't
			 * created/joined a household yet. Loaded once per request in hooks.
			 */
			member: import('$lib/server/db/schema').Member | null;
			/**
			 * The language this request is answered in — the member's own choice,
			 * else the cookie, else the browser's `Accept-Language` (→ hooks.server.ts).
			 * Always set, including for signed-out requests.
			 */
			locale: import('$lib/i18n/locale').Locale;
			/**
			 * The theme this request is painted in, or null for "follow the device"
			 * — the cookie alone, since nothing on the server needs a colour
			 * (→ hooks.server.ts, `$lib/theme`). Null is a real setting, not an
			 * absence: it hands the decision to `prefers-color-scheme`.
			 */
			theme: import('$lib/theme').Theme | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
