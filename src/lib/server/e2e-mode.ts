/**
 * E2E mode (→ docs/TESTING.md, DECISIONS #139).
 *
 * `E2E_MODE=true` turns on the two things a browser test — or a verification
 * session with no Google account to hand — needs and production must never
 * have: password sign-in through Better Auth's own `/api/auth/sign-up/email`
 * endpoint (→ `auth.ts`), and the `/dev/kit` gallery on a production build
 * (→ `routes/dev/kit`). Everything else is the real app, which is the point:
 * the tests run against `node build/index.js`, the same server Coolify runs.
 *
 * Read per call rather than at import (→ `version.ts` for why: the env is empty
 * while the app builds). `hooks.server.ts` calls `assertE2EModeAllowed` at boot:
 * a deployed instance has a public `ORIGIN`, and the flag on a public origin is
 * a refusal to start, not a warning — a warning scrolls past in a deploy log.
 */
import { env } from '$env/dynamic/private';

export function e2eMode(): boolean {
	return env.E2E_MODE === 'true';
}

/** Where the flag is allowed at all: a server nobody but its own machine reaches. */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Throws when `E2E_MODE` is on and `ORIGIN` is not local. Called once at boot;
 * `scripts/smoke.ts` additionally probes every deploy from the outside.
 */
export function assertE2EModeAllowed(): void {
	if (!e2eMode()) return;
	const origin = env.ORIGIN ?? '';
	if (LOCAL_ORIGIN.test(origin)) {
		console.warn(
			'[e2e] E2E_MODE=true: password sign-in and /dev/kit are enabled. Never run a deployed instance like this (→ docs/TESTING.md).'
		);
		return;
	}
	throw new Error(
		`E2E_MODE=true is only allowed on a localhost ORIGIN, not ${origin || '(unset)'} — unset it on this deploy (→ docs/TESTING.md).`
	);
}
