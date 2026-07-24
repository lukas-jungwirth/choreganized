/**
 * Route guards. Every `(app)` load and form action starts with `requireMember`;
 * every service function then takes the returned `householdId` as its first
 * argument. That pair is the whole multi-tenancy boundary
 * (→ docs/ARCHITECTURE.md "Server patterns").
 */
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import type { Member } from './db/schema';

export type SessionUser = NonNullable<App.Locals['user']>;

export type MemberContext = {
	user: SessionUser;
	member: Member;
	/** Always pass this as the first argument to service functions. */
	householdId: string;
};

/** Signed-in user, or redirect to the login screen. */
export function requireUser(event: RequestEvent): SessionUser {
	const { user } = event.locals;
	if (!user) redirect(303, '/login');
	return user;
}

/** Signed-in user *with* a household membership, or redirect to onboarding. */
export function requireMember(event: RequestEvent): MemberContext {
	const user = requireUser(event);
	const { member } = event.locals;
	if (!member) redirect(303, '/onboarding');
	return { user, member, householdId: member.householdId };
}

/**
 * The same two checks for the JSON endpoints (→ DECISIONS #20), which answer
 * with a status instead of a redirect: `fetch` follows a 303 to /login and hands
 * the caller a page of HTML with a 200 on it — a failure that arrives looking
 * exactly like a success.
 */
export function requireUserApi(event: RequestEvent): SessionUser {
	const { user } = event.locals;
	if (!user) error(401, catalog(event.locals.locale).errors.notSignedIn);
	return user;
}

export function requireMemberApi(event: RequestEvent): MemberContext {
	const user = requireUserApi(event);
	const { member } = event.locals;
	if (!member) error(403, catalog(event.locals.locale).errors.notInHousehold);
	return { user, member, householdId: member.householdId };
}
