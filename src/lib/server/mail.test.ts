/**
 * Where a mail goes (→ mail.ts). The order is the safety: a test run never
 * reaches SMTP, and a deploy never writes sign-in codes to a file.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { mailRoute, signInCodeMail } from './mail';

const SMTP = { SMTP_HOST: 'smtp.example.test', MAIL_FROM: 'Choreganized <a@example.test>' };
const DEPLOY = { dev: false, e2e: false };

describe('mailRoute', () => {
	it('is off on a deploy with no SMTP settings — the login page then hides email', () => {
		assert.deepEqual(mailRoute({}, DEPLOY), { kind: 'off' });
		// Half a configuration is still none: no sender means nothing to send as.
		assert.deepEqual(mailRoute({ SMTP_HOST: 'smtp.example.test' }, DEPLOY), { kind: 'off' });
	});

	it('sends over SMTP, STARTTLS port by default', () => {
		assert.deepEqual(mailRoute({ ...SMTP, SMTP_USER: 'u', SMTP_PASS: 'p' }, DEPLOY), {
			kind: 'smtp',
			host: 'smtp.example.test',
			port: 587,
			user: 'u',
			pass: 'p',
			from: 'Choreganized <a@example.test>'
		});
		assert.equal(mailRoute({ ...SMTP, SMTP_PORT: '465' }, DEPLOY).kind, 'smtp');
	});

	it('ignores an outbox on a deploy, where it would put codes on disk', () => {
		assert.equal(mailRoute({ ...SMTP, MAIL_OUTBOX: '/tmp/o.jsonl' }, DEPLOY).kind, 'smtp');
		assert.equal(mailRoute({ MAIL_OUTBOX: '/tmp/o.jsonl' }, DEPLOY).kind, 'off');
	});

	it('prefers the outbox over SMTP in E2E mode and dev, so a test never mails anyone', () => {
		const vars = { ...SMTP, MAIL_OUTBOX: 'data/e2e/outbox.jsonl' };
		assert.deepEqual(mailRoute(vars, { dev: false, e2e: true }), {
			kind: 'outbox',
			path: 'data/e2e/outbox.jsonl'
		});
		assert.equal(mailRoute(vars, { dev: true, e2e: false }).kind, 'outbox');
	});

	it('prints to the terminal in dev with nothing configured', () => {
		assert.deepEqual(mailRoute({}, { dev: true, e2e: false }), { kind: 'console' });
	});
});

describe('signInCodeMail', () => {
	it('puts the code in the subject and the body, in the asked-for language', () => {
		const en = signInCodeMail('a@example.test', '123456', 'en');
		assert.equal(en.to, 'a@example.test');
		assert.match(en.subject, /123456/);
		assert.match(en.text, /123456/);

		const de = signInCodeMail('a@example.test', '654321', 'de');
		assert.match(de.subject, /654321 ist dein/);
	});
});
