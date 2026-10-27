/**
 * Outgoing email (→ docs/ARCHITECTURE.md "Email", plan 31).
 *
 * One message today: the sign-in code (→ `auth.ts`). Plain text on purpose —
 * a six-digit code needs no layout, a text mail is the one spam filters trust
 * most, and it keeps colours out of a place the design tokens can't reach.
 *
 * Where a message goes is decided per send from the environment, in this order:
 *
 *   outbox   `MAIL_OUTBOX` names a file and this is E2E mode or `npm run dev`:
 *            one JSON line per message, which is how Playwright reads the code.
 *            Checked first so a test run never sends a real mail, and refused
 *            on a deploy, where it would write sign-in codes to disk. A mail to
 *            an address at `mail-fails.test` throws instead, the way a refused
 *            SMTP login does, so a test can see what the login page says then.
 *   smtp     `SMTP_HOST` + `MAIL_FROM`: any provider, through nodemailer.
 *   console  `npm run dev` with neither: the code is printed to the terminal.
 *   off      none of the above. Email sign-in is hidden (→ `routes/login`),
 *            which is what a deploy without SMTP variables gets.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { catalog, type Locale } from '$lib/i18n';
import { e2eMode } from './e2e-mode';

export type MailMessage = { to: string; subject: string; text: string };

export type MailRoute =
	| { kind: 'outbox'; path: string }
	| { kind: 'smtp'; host: string; port: number; user?: string; pass?: string; from: string }
	| { kind: 'console' }
	| { kind: 'off' };

type MailEnv = Record<string, string | undefined>;

/** Where mail goes for this environment — pure, so the order above is testable. */
export function mailRoute(vars: MailEnv, local: { dev: boolean; e2e: boolean }): MailRoute {
	if (vars.MAIL_OUTBOX && (local.dev || local.e2e))
		return { kind: 'outbox', path: vars.MAIL_OUTBOX };
	if (vars.SMTP_HOST && vars.MAIL_FROM) {
		return {
			kind: 'smtp',
			host: vars.SMTP_HOST,
			port: Number(vars.SMTP_PORT) || 587,
			user: vars.SMTP_USER || undefined,
			pass: vars.SMTP_PASS || undefined,
			from: vars.MAIL_FROM
		};
	}
	if (local.dev) return { kind: 'console' };
	return { kind: 'off' };
}

function currentRoute(): MailRoute {
	return mailRoute(env, { dev, e2e: e2eMode() });
}

/** Mail to this domain fails in the outbox (dev/E2E only) — see the header. */
export const OUTBOX_FAILING_DOMAIN = 'mail-fails.test';

/** Whether this server can send mail at all — the login page asks. */
export function mailEnabled(): boolean {
	return currentRoute().kind !== 'off';
}

/** One transport per server, rebuilt only if the settings change. */
let transport: { key: string; transporter: Transporter } | undefined;

function smtpTransport(route: Extract<MailRoute, { kind: 'smtp' }>): Transporter {
	const key = `${route.host}:${route.port}:${route.user ?? ''}`;
	if (transport?.key !== key) {
		transport = {
			key,
			transporter: nodemailer.createTransport({
				host: route.host,
				port: route.port,
				// 465 is TLS from the first byte; anything else must upgrade with
				// STARTTLS — `requireTLS` refuses to send a code over a plain line.
				secure: route.port === 465,
				requireTLS: route.port !== 465,
				auth: route.user ? { user: route.user, pass: route.pass ?? '' } : undefined
			})
		};
	}
	return transport.transporter;
}

/** Sends one message, or throws — the caller turns that into "couldn't send". */
export async function sendMail(message: MailMessage): Promise<void> {
	const route = currentRoute();
	switch (route.kind) {
		case 'outbox':
			if (message.to.endsWith(`@${OUTBOX_FAILING_DOMAIN}`)) {
				throw new Error(`outbox: ${OUTBOX_FAILING_DOMAIN} refuses mail, on purpose`);
			}
			mkdirSync(dirname(route.path), { recursive: true });
			appendFileSync(route.path, JSON.stringify({ ...message, at: Date.now() }) + '\n');
			return;
		case 'smtp':
			await smtpTransport(route).sendMail({ from: route.from, ...message });
			return;
		case 'console':
			console.info(`[mail] to ${message.to} — ${message.subject}\n${message.text}`);
			return;
		case 'off':
			throw new Error('Mail is not configured — set SMTP_HOST and MAIL_FROM (→ .env.example).');
	}
}

/** How long a sign-in code works, in minutes — `auth.ts` sets the expiry from it. */
export const SIGN_IN_CODE_MINUTES = 5;

/** The sign-in code mail, in the language the login page was shown in. */
export function signInCodeMail(to: string, code: string, locale: Locale): MailMessage {
	const m = catalog(locale).auth.mail;
	return {
		to,
		subject: m.subject(code),
		text: m.body(code, SIGN_IN_CODE_MINUTES)
	};
}
