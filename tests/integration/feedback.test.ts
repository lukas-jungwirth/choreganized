/**
 * Feedback through its service (→ services/feedback.ts, DECISIONS #136).
 *
 * The contract the Settings action leans on: the row is the receipt, it is
 * stored verbatim, and an unconfigured mirror costs nothing — no attempt, no
 * error, no backoff. `.env.test` sets no `GITHUB_FEEDBACK_TOKEN`, which is the
 * state every fresh deploy is in.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { githubConfigured } from '$lib/server/github';
import {
	FeedbackError,
	submitFeedback,
	sweepFeedback,
	syncFeedback
} from '$lib/server/services/feedback';
import { FEEDBACK_BODY_MAX } from '$lib/utils/feedback';
import { eq } from 'drizzle-orm';
import { db, makeHousehold, tables } from '../helpers/db';

const REPORT = {
	kind: 'bug' as const,
	locale: 'de' as const,
	theme: 'dark' as const,
	userAgent: 'Vitest'
};

describe('submitFeedback', () => {
	it('stores the words byte-for-byte, with the envelope and no attempt spent', () => {
		const { householdId, owner } = makeHousehold();
		const body = 'Die Liste springt nach oben.\n\n```js\nconsole.log("@octocat #1")\n```';
		const now = new Date('2026-03-10T18:00:00Z');

		const row = submitFeedback(householdId, owner.id, { ...REPORT, body }, now);

		assert.equal(row.body, body);
		assert.equal(row.memberName, 'Owner');
		assert.equal(row.locale, 'de');
		assert.equal(row.theme, 'dark');
		assert.equal(row.appVersion, 'dev');
		assert.equal(row.attempts, 0);
		assert.equal(row.issueNumber, null);
		assert.equal(row.nextAttemptAt?.getTime(), now.getTime());
	});

	it('clamps an over-long body rather than letting GitHub refuse it later', () => {
		const { householdId, owner } = makeHousehold();

		const row = submitFeedback(householdId, owner.id, {
			...REPORT,
			body: 'x'.repeat(FEEDBACK_BODY_MAX + 500)
		});

		assert.equal(row.body.length, FEEDBACK_BODY_MAX);
	});

	it('refuses a member id from another household', () => {
		const a = makeHousehold();
		const b = makeHousehold();

		assert.throws(
			() => submitFeedback(a.householdId, b.owner.id, { ...REPORT, body: 'hi' }),
			(error) => error instanceof FeedbackError && error.code === 'not-member'
		);
	});
});

describe('the mirror with no token', () => {
	it('is off, and says so', () => {
		assert.equal(githubConfigured(), false);
	});

	it('sync returns null and does not burn a retry', async () => {
		const { householdId, owner } = makeHousehold();
		const row = submitFeedback(householdId, owner.id, { ...REPORT, body: 'unsynced' });

		assert.equal(await syncFeedback(householdId, row.id), null);

		const after = db.select().from(tables.feedback).where(eq(tables.feedback.id, row.id)).get();
		assert.equal(after?.attempts, 0);
		assert.equal(after?.lastError, null);
	});

	it('the sweep does nothing rather than failing everything', async () => {
		assert.deepEqual(await sweepFeedback(), { synced: 0, failed: 0 });
	});
});
