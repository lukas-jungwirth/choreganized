/**
 * Liveness for the smoke test and for uptime checks (→ docs/TESTING.md
 * "Smoke", DECISIONS #141). Public on purpose and household-blind by design:
 * it answers *which build* is up and whether the database answers — nothing a
 * signed-out visitor couldn't learn from the public repository — so a deploy
 * can be recognised by its commit before anything is asserted against it.
 */
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { appVersion } from '$lib/server/version';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const { version, commit } = appVersion();
	const headers = { 'cache-control': 'no-store' };

	try {
		db.get(sql`select 1`);
	} catch (error) {
		console.error('[health] database check failed:', error);
		return json({ ok: false, version, commit }, { status: 503, headers });
	}

	return json({ ok: true, version, commit }, { headers });
};
