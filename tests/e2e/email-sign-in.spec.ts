/**
 * Sign in with an emailed code (→ SPEC §1.1, plan 31). The server under test
 * writes its mail to an outbox file instead of sending it (→ scripts/e2e-server.ts,
 * `lib/server/mail.ts`), which is where the code is read from — the same text a
 * person would read in their inbox.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { DATABASE_PATH } from './accounts';

test.use({ storageState: { cookies: [], origins: [] } });

const OUTBOX = join(dirname(DATABASE_PATH), 'outbox.jsonl');

/** The code in the newest mail to `email`, waiting for it to be written. */
async function codeFor(email: string): Promise<string> {
	let code: string | undefined;
	await expect
		.poll(() => {
			const lines = readOutbox().filter((mail) => mail.to === email);
			code = lines.at(-1)?.text.match(/\b\d{6}\b/)?.[0];
			return code;
		})
		.toBeTruthy();
	return code!;
}

function readOutbox(): { to: string; subject: string; text: string }[] {
	try {
		return readFileSync(OUTBOX, 'utf8')
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	} catch {
		return [];
	}
}

test('a new address signs up with the code from its email and lands on onboarding', async ({
	page
}) => {
	const email = `code-${Date.now()}@e2e.test`;
	await page.goto('/login');

	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Get a sign-in code' }).click();
	await expect(page.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible();

	// A wrong code first: refused, and the screen says so.
	const code = await codeFor(email);
	const wrong = code === '000000' ? '111111' : '000000';
	await page.getByLabel('Code').fill(wrong);
	await expect(page.getByRole('alert')).toHaveText(/That code isn’t right/);

	// The sixth digit signs in — no button press, as with iOS's code autofill.
	await page.getByLabel('Code').fill(code);
	await expect(page).toHaveURL(/\/onboarding$/);
	// No Google profile, so no name to greet by yet.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome');
});

test('a bad address never leaves the page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('not-an-address');
	await page.getByRole('button', { name: 'Get a sign-in code' }).click();
	await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
});

test('a mail that could not be sent says so, and stays on the email step', async ({ page }) => {
	// The E2E outbox refuses this domain the way a wrong SMTP password does
	// (→ lib/server/mail.ts). Before the fix the page said "We sent a code".
	await page.goto('/login');
	await page.getByLabel('Email').fill('someone@mail-fails.test');
	await page.getByRole('button', { name: 'Get a sign-in code' }).click();

	await expect(page.getByRole('alert')).toHaveText(
		/The email couldn’t be sent, so no code is on its way/
	);
	await expect(page.getByText('We sent a 6-digit code')).toHaveCount(0);
	await expect(page.getByLabel('Email')).toHaveValue('someone@mail-fails.test');
});

test('the code shows one digit per box, and a pasted code fills them all', async ({ page }) => {
	const email = `boxes-${Date.now()}@e2e.test`;
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Get a sign-in code' }).click();

	// One real input (autofill, paste and screen readers see one field)…
	const input = page.getByLabel('Code');
	await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
	await expect(input).toHaveAttribute('inputmode', 'numeric');

	// …drawn as six boxes. Three digits fill three; letters never land.
	await input.pressSequentially('4a8 2');
	const boxes = page.locator('.box');
	await expect(boxes).toHaveCount(6);
	await expect(boxes).toHaveText(['4', '8', '2', '', '', '']);

	// "Send again" says a new code is coming; the old one is dead.
	await page.getByRole('button', { name: 'Send again' }).click();
	await expect(page.getByRole('status')).toHaveText(/We sent a new code/);

	// A pasted code with a space in it ("123 456" from the mail) still signs in.
	const code = await codeFor(email);
	await input.fill(`${code.slice(0, 3)} ${code.slice(3)}`);
	await expect(page).toHaveURL(/\/onboarding$/);
});
