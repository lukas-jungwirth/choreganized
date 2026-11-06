/**
 * Admin mode (→ plan 34, SPEC §12, DECISIONS #227).
 *
 * Two separate questions, both answered here and nowhere else:
 *
 * - **Who is an admin** is the deploy's, never the database's: an account whose
 *   *verified* email is in `ADMIN_EMAILS`. Google and the email code both
 *   verify the address; E2E mode's password sign-up doesn't, so on a deploy an
 *   unverified account can't claim an admin's address by typing it. Unset →
 *   nobody is an admin, which is every deploy until Lukas sets it.
 * - **Is admin mode on** is the admin's own preference: a cookie, set by tapping
 *   the version seven times and cleared by "Leave admin mode" in Settings. It
 *   grants nothing on its own; every read also asks `isAdmin`, so a copied or
 *   forged cookie on any other account is just ignored.
 *
 * Read per call rather than at import (→ `version.ts`: the env is empty while
 * the app builds).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { e2eMode } from './e2e-mode';

export const ADMIN_COOKIE = 'admin_mode';

/** Long enough to stay on for a working session on the phone; cleared on "Leave". */
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type AdminCandidate = { email: string; emailVerified?: boolean | null };

/** `ADMIN_EMAILS` as a set: comma-separated, case and spaces ignored, blanks dropped. */
export function adminEmails(value: string | undefined): Set<string> {
	return new Set(
		(value ?? '')
			.split(',')
			.map((email) => email.trim().toLowerCase())
			.filter(Boolean)
	);
}

/**
 * The rule itself, with its inputs passed in so it can be tested without an env.
 * `trustUnverified` is E2E mode only — a localhost-only server
 * (→ `assertE2EModeAllowed`) whose accounts are all password sign-ups.
 */
export function isAdminBy(
	user: AdminCandidate | null | undefined,
	list: Set<string>,
	trustUnverified: boolean
): boolean {
	if (!user || list.size === 0) return false;
	if (!user.emailVerified && !trustUnverified) return false;
	return list.has(user.email.trim().toLowerCase());
}

export function isAdmin(user: AdminCandidate | null | undefined): boolean {
	return isAdminBy(user, adminEmails(env.ADMIN_EMAILS), e2eMode());
}

/** Admin mode is on: an admin, *and* they turned it on on this device. */
export function adminMode(event: RequestEvent): boolean {
	return isAdmin(event.locals.user) && event.cookies.get(ADMIN_COOKIE) === '1';
}

export function enterAdminMode(event: RequestEvent): void {
	event.cookies.set(ADMIN_COOKIE, '1', {
		path: '/',
		maxAge: ADMIN_COOKIE_MAX_AGE,
		httpOnly: true,
		// `secure` is SvelteKit's default, which it relaxes on http://localhost only.
		sameSite: 'lax'
	});
}

export function leaveAdminMode(event: RequestEvent): void {
	event.cookies.delete(ADMIN_COOKIE, { path: '/' });
}
