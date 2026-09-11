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
import { e2eMode } from './e2e-mode';

/**
 * `vite build` imports server modules just to read their route options, so a
 * missing secret must fail the *server start*, not the build. The build-time
 * value must be **non-empty**: Better Auth throws "You are using the default
 * secret" on a falsy secret even when nothing authenticates, which would fail
 * `docker build` (where `.env` is absent). At runtime `building` is false, so a
 * genuinely missing variable still throws before the server serves a request.
 */
function requireEnv(name: string): string {
	const value = env[name];
	if (value) return value;
	if (building) return `build-time-placeholder-${name}`;
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
	/**
	 * Only under `E2E_MODE=true` (→ `e2e-mode.ts`, docs/TESTING.md): the way
	 * Playwright — and a verification session with no Google account — mints a
	 * session, via Better Auth's own `/api/auth/sign-up/email`. Off, the endpoint
	 * still exists and answers that the method is disabled, which is what
	 * production has always done.
	 */
	emailAndPassword: { enabled: e2eMode() },
	// Better Auth rate-limits in production — three sign-ups per ten seconds per
	// IP — and the tests run the production build from one IP: a retried
	// journey would 429 and report it as bad credentials. Off in E2E mode only;
	// `undefined` leaves the production default untouched.
	rateLimit: e2eMode() ? { enabled: false } : undefined,
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
