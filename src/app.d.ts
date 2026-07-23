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
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
