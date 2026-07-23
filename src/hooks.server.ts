/**
 * Server wiring: boot tasks (`init`) and per-request auth context (`handle`).
 */
import { building } from '$app/environment';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { eq } from 'drizzle-orm';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { registerCronJobs } from '$lib/server/cron';
import { db, runMigrations } from '$lib/server/db';
import { members } from '$lib/server/db/schema';

/** Runs once before the first request — safe with a single instance. */
export const init: ServerInit = () => {
	runMigrations();
	registerCronJobs();
};

export const handle: Handle = async ({ event, resolve }) => {
	// Better Auth owns /api/auth/** end-to-end; no locals needed there.
	if (isAuthPath(event.url.toString(), auth.options)) {
		return svelteKitHandler({ auth, event, resolve, building });
	}

	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.member = session
		? (db.select().from(members).where(eq(members.userId, session.user.id)).get() ?? null)
		: null;

	return resolve(event);
};
