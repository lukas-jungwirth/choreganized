/**
 * Better Auth instance — Google OAuth, and a code sent by email (plan 31).
 * Passwords stay off outside E2E mode (→ docs/DECISIONS.md #1, plan 31's entry).
 *
 * The four auth tables live in `db/schema.ts` and are handed to the drizzle
 * adapter explicitly; the adapter maps Better Auth's field names onto the
 * drizzle *property* names, so those must keep matching the installed version's
 * core schema (`@better-auth/core/db/get-tables`, cross-checked in plan 00).
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { DEFAULT_LOCALE, type Locale } from '$lib/i18n';
import { db } from './db';
import { account, session, user, verification } from './db/schema';
import { e2eMode } from './e2e-mode';
import { SIGN_IN_CODE_MINUTES, sendMail, signInCodeMail } from './mail';

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

/** The language of the login page that asked for the code, so the mail matches it. */
function requestLocale(): Locale {
	try {
		return getRequestEvent().locals.locale ?? DEFAULT_LOCALE;
	} catch {
		// `auth.api.*` called outside a request (the integration tests).
		return DEFAULT_LOCALE;
	}
}

/**
 * Requests whose code mail could not be sent, keyed by Better Auth's
 * per-request context: the send callback and the after-hook below see the same
 * object. Better Auth runs the callback through `runInBackgroundOrAwait`, which
 * logs a thrown error and answers 200 anyway, so without this the login page
 * said "We sent a code" for a mail that never left (→ DECISIONS #178).
 */
const failedSends = new WeakSet<object>();

/** The code the login page maps to "couldn't send" (→ `routes/login`, which spells it out). */
const MAIL_SEND_FAILED = 'MAIL_SEND_FAILED';

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
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path === '/email-otp/send-verification-otp' && failedSends.has(ctx.context)) {
				throw new APIError('SERVICE_UNAVAILABLE', {
					code: MAIL_SEND_FAILED,
					message: 'The sign-in code could not be sent.'
				});
			}
		})
	},
	plugins: [
		/**
		 * Sign in with a six-digit code sent by email (plan 31, SPEC §1.1). A
		 * code rather than a magic link: an installed iOS PWA keeps its own
		 * cookies, so a link tapped in Mail would sign Safari in and leave the
		 * app signed out, and mail scanners that open links would burn it. The
		 * codes live hashed in `verification`; three wrong tries kill one, and
		 * the plugin's own rate limit allows three sends and three sign-ins per
		 * minute per IP. A first code for a new address creates the account,
		 * exactly as a first Google sign-in does.
		 */
		emailOTP({
			otpLength: 6,
			expiresIn: SIGN_IN_CODE_MINUTES * 60,
			allowedAttempts: 3,
			storeOTP: 'hashed',
			async sendVerificationOTP({ email, otp, type }, ctx) {
				// Only sign-in exists: no passwords to reset, and no address
				// changes. The plugin's other endpoints mail nothing.
				if (type !== 'sign-in') return;
				// Awaited, against the plugin's timing advice: sign-up is open, so
				// every address gets a code and the timing reveals nothing — and a
				// mail that couldn't be sent must say so on the login page.
				try {
					await sendMail(signInCodeMail(email, otp, requestLocale()));
				} catch (error) {
					// The plugin would swallow this; the hook below turns it into a 503.
					console.error('[mail] the sign-in code could not be sent:', error);
					if (!ctx) throw error;
					failedSends.add(ctx.context);
				}
			}
		}),
		// Must stay last: writes cookies from server-side `auth.api.*` calls (the
		// session refresh in hooks.server.ts) onto the SvelteKit response.
		sveltekitCookies(getRequestEvent)
	]
});
