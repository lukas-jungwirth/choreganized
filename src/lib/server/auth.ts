/**
 * Better Auth instance — Google OAuth only in v1 (→ docs/DECISIONS.md #1).
 *
 * The four auth tables live in `db/schema.ts` and are handed to the drizzle
 * adapter explicitly; the adapter maps Better Auth's field names onto the
 * drizzle *property* names, so those must keep matching the installed version's
 * core schema (`@better-auth/core/db/get-tables`, cross-checked in plan 00).
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { account, session, user, verification } from './db/schema';

/**
 * `vite build` imports server modules just to read their route options, so a
 * missing secret must fail the *server start*, not the build.
 */
function requireEnv(name: string): string {
	const value = env[name];
	if (value) return value;
	if (building) return '';
	throw new Error(`Missing required environment variable ${name} — see .env.example.`);
}

export const auth = betterAuth({
	appName: 'Choreganized',
	secret: requireEnv('BETTER_AUTH_SECRET'),
	// Falls back to the request origin when unset; set it so the Google redirect
	// URI stays stable behind a proxy.
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: 'sqlite',
		schema: { user, session, account, verification }
	}),
	socialProviders: {
		google: {
			clientId: requireEnv('GOOGLE_CLIENT_ID'),
			clientSecret: requireEnv('GOOGLE_CLIENT_SECRET')
		}
	},
	// Must stay last: writes cookies from server-side `auth.api.*` calls (the
	// session refresh in hooks.server.ts) onto the SvelteKit response.
	plugins: [sveltekitCookies(getRequestEvent)]
});
