/**
 * Where a mail goes (→ mail.ts). The order is the safety: a test run never
 * reaches SMTP, and a deploy never writes sign-in codes to a file.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { catalog } from '$lib/i18n';
import { mailRoute, signInCodeMail, SIGN_IN_CODE_MINUTES } from './mail';
import { escapeHtml, ICON_CID, signInCodeHtml } from './sign-in-mail';

const SMTP = { SMTP_HOST: 'smtp.example.test', MAIL_FROM: 'Haushaltsheld <a@example.test>' };
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
			from: 'Haushaltsheld <a@example.test>'
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

describe('signInCodeMail, HTML part (→ DECISIONS #294)', () => {
	it('keeps the plain-text part word for word, for filters and text-only clients', () => {
		const mail = signInCodeMail('a@example.test', '123456', 'en');
		assert.equal(
			mail.text,
			'Your sign-in code for Haushaltsheld:\n\n123456\n\nIt works for 10 minutes. If you didn’t ask for it, you can ignore this email. Nobody can sign in without the code.'
		);
	});

	it('sends an HTML part with the code, the tagline and every line of copy, in English', () => {
		const { html } = signInCodeMail('a@example.test', '482913', 'en');
		assert.ok(html, 'no HTML part');
		assert.match(html, /<html lang="en"/);
		assert.match(html, />482913</);
		for (const line of [
			'Haushaltsheld',
			'Little helpers for every day',
			'Here’s your sign-in code',
			'Type it on the sign-in page to continue.',
			'Works for 10 minutes',
			'Didn’t ask for this? You can ignore this email. Nobody can sign in without the code.',
			'You get this because someone asked for a sign-in code on Haushaltsheld.'
		]) {
			assert.ok(html.includes(line), `missing: ${line}`);
		}
	});

	it('speaks German when the login page did', () => {
		const { html } = signInCodeMail('a@example.test', '654321', 'de');
		assert.ok(html, 'no HTML part');
		assert.match(html, /<html lang="de"/);
		assert.match(html, />654321</);
		const m = catalog('de').auth.mail;
		for (const line of [
			'Kleine Helfer für deinen Alltag',
			m.heading,
			m.lead,
			m.validFor(SIGN_IN_CODE_MINUTES),
			m.fine,
			m.footer
		]) {
			assert.ok(html.includes(escapeHtml(line)), `missing: ${line}`);
		}
		assert.ok(!html.includes('Here’s your sign-in code'));
	});

	it('carries the app icon inline, the HTML pointing at its cid, with an empty alt', () => {
		const mail = signInCodeMail('a@example.test', '123456', 'en');
		assert.equal(mail.attachments?.length, 1);
		const [icon] = mail.attachments!;
		assert.equal(icon.cid, ICON_CID);
		assert.equal(icon.contentType, 'image/png');
		// A real PNG, not an empty buffer: the signature is \x89PNG.
		assert.equal(icon.content.subarray(1, 4).toString('ascii'), 'PNG');
		assert.match(mail.html!, new RegExp(`<img src="cid:${ICON_CID}"[^>]* alt=""`));
		// Nothing is fetched from anywhere when the mail opens.
		assert.doesNotMatch(mail.html!, /(src|href)="https?:/);
	});

	it('follows a dark mail app and hides the preview line', () => {
		const { html } = signInCodeMail('a@example.test', '123456', 'en');
		assert.match(html!, /<meta name="color-scheme" content="light dark">/);
		assert.match(html!, /@media \(prefers-color-scheme: dark\)/);
		assert.match(
			html!,
			/class="hh-preheader"[^>]*>Type it on the sign-in page to continue\. It works for 10 minutes\./
		);
	});

	it('escapes what goes into the HTML', () => {
		const m = { ...catalog('en').auth.mail, heading: 'Tom & <b>Jerry</b>' };
		const html = signInCodeHtml('<script>', 10, {
			locale: 'en',
			wordmark: 'Haus"halt',
			tagline: "it's",
			m
		});
		assert.ok(html.includes('Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;'));
		assert.ok(html.includes('&lt;script&gt;'));
		assert.ok(!html.includes('<script>'));
		assert.ok(html.includes('Haus&quot;halt'));
		assert.ok(html.includes('it&#39;s'));
	});
});
