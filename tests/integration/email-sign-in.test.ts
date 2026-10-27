/**
 * Sign in with an emailed code (→ auth.ts, plan 31), through Better Auth's own
 * endpoints on the migrated in-memory database. Only the mail is faked: the
 * code is read out of what would have been sent.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, it, vi } from 'vitest';
import type { MailMessage } from '$lib/server/mail';
import { db, migrateOnce, tables } from '../helpers/db';

const sent = vi.hoisted(() => [] as MailMessage[]);

vi.mock('$lib/server/mail', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/mail')>()),
	sendMail: async (message: MailMessage) => {
		// The SMTP server refusing us, e.g. a wrong app password (535).
		if (message.to.startsWith('refused-')) throw new Error('535 authentication failed');
		sent.push(message);
	}
}));

// No request around these calls, so no response to put a cookie on: the
// SvelteKit cookie plugin skips itself when there is no event.
vi.mock('$app/server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/server')>()),
	getRequestEvent: () => undefined
}));

const { auth } = await import('$lib/server/auth');

let n = 0;
const freshEmail = () => `code-${++n}-${crypto.randomUUID().slice(0, 8)}@example.test`;

/** Each request from its own address, so the plugin's per-IP limit never trips. */
const headers = () =>
	new Headers({ 'x-forwarded-for': `10.0.${n}.${Math.floor(Math.random() * 250)}` });

async function requestCode(email: string): Promise<string> {
	await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' }, headers: headers() });
	const mail = sent.findLast((message) => message.to === email);
	assert.ok(mail, `no mail to ${email}`);
	const code = mail.text.match(/\b\d{6}\b/)?.[0];
	assert.ok(code, 'no six-digit code in the mail');
	return code;
}

async function signInWith(email: string, otp: string) {
	return auth.api.signInEmailOTP({ body: { email, otp }, headers: headers() });
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;
	} catch (error) {
		return (error as { body?: { code?: string } }).body?.code;
	}
	assert.fail('expected the sign-in to be refused');
}

beforeAll(() => migrateOnce());
beforeEach(() => {
	sent.length = 0;
});

describe('email code sign-in', () => {
	it('mails a six-digit code that signs a new address up, verified and nameless', async () => {
		const email = freshEmail();
		const code = await requestCode(email);

		const result = await signInWith(email, code);

		assert.ok(result.token);
		const user = db.select().from(tables.user).where(eq(tables.user.email, email)).get();
		assert.ok(user);
		assert.equal(user.emailVerified, true);
		// Onboarding asks for the display name (→ onboarding.start.welcome).
		assert.equal(user.name, '');
	});

	it('signs an existing account in as itself — a Google user can use a code too', async () => {
		const email = freshEmail();
		const id = crypto.randomUUID();
		db.insert(tables.user).values({ id, name: 'Google Person', email, emailVerified: true }).run();

		const result = await signInWith(email, await requestCode(email));

		assert.equal(result.user.id, id);
	});

	it('keeps the code hashed at rest', async () => {
		const email = freshEmail();
		const code = await requestCode(email);

		const rows = db.select().from(tables.verification).all();
		assert.ok(rows.length > 0);
		for (const row of rows) assert.ok(!row.value.includes(code), 'the code is stored in clear');
	});

	it('refuses a wrong code, and kills the code after three wrong tries', async () => {
		const email = freshEmail();
		const code = await requestCode(email);
		const wrong = code === '000000' ? '111111' : '000000';

		assert.equal(await errorCodeOf(signInWith(email, wrong)), 'INVALID_OTP');
		assert.equal(await errorCodeOf(signInWith(email, wrong)), 'INVALID_OTP');
		assert.equal(await errorCodeOf(signInWith(email, wrong)), 'INVALID_OTP');
		// Now even the right one is refused: brute force gets three guesses per mail.
		assert.equal(await errorCodeOf(signInWith(email, code)), 'TOO_MANY_ATTEMPTS');
	});

	it('refuses an expired code', async () => {
		const email = freshEmail();
		const code = await requestCode(email);
		db.update(tables.verification)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.run();

		assert.equal(await errorCodeOf(signInWith(email, code)), 'OTP_EXPIRED');
	});

	it('works once: a used code cannot sign in again', async () => {
		const email = freshEmail();
		const code = await requestCode(email);
		await signInWith(email, code);

		assert.ok(await errorCodeOf(signInWith(email, code)));
	});

	it('answers 503 MAIL_SEND_FAILED when the mail could not be sent, instead of a silent 200', async () => {
		// Better Auth logs a failing send and answers success; the after-hook in
		// auth.ts is what makes the login page say it failed (→ DECISIONS #178).
		const email = `refused-${freshEmail()}`;
		const error = await auth.api
			.sendVerificationOTP({ body: { email, type: 'sign-in' }, headers: headers() })
			.then(
				() => assert.fail('the send succeeded although the mail was refused'),
				(e: { statusCode?: number; body?: { code?: string } }) => e
			);

		assert.equal(error.statusCode, 503);
		assert.equal(error.body?.code, 'MAIL_SEND_FAILED');
	});

	it('does not let one failed send mark the next request as failed', async () => {
		await auth.api
			.sendVerificationOTP({
				body: { email: `refused-${freshEmail()}`, type: 'sign-in' },
				headers: headers()
			})
			.catch(() => undefined);

		const email = freshEmail();
		assert.match(await requestCode(email), /^\d{6}$/);
	});

	it('keeps a code for ten minutes', async () => {
		const email = freshEmail();
		const before = Date.now();
		await requestCode(email);

		const row = db
			.select()
			.from(tables.verification)
			.where(eq(tables.verification.identifier, `sign-in-otp-${email}`))
			.get();
		assert.ok(row);
		const minutes = (row.expiresAt.getTime() - before) / 60_000;
		assert.ok(minutes > 9.9 && minutes <= 10.1, `expires after ${minutes.toFixed(2)} minutes`);
	});
});
