/**
 * The raccoon album (→ plan 35): meeting a raccoon on Home puts it in your
 * album, once per slot of the day. A brand-new household, so the album starts
 * empty and Home shows an everyday pose (no chores are on anyone yet).
 *
 * The first look is always the welcome raccoon (→ DECISIONS #238). The next
 * slot comes from the household's timezone rather than the clock: every run is
 * the same Vienna afternoon (→ TESTING.md "The fixed clock"), and Auckland is
 * ten hours ahead of it, which is midnight there: the sleeping raccoon.
 */
import Database from 'better-sqlite3';
import { expect, request, test, type Page } from '@playwright/test';
import { DATABASE_PATH } from './accounts';

test.use({ storageState: { cookies: [], origins: [] } });

async function freshHousehold(page: Page, name: string) {
	await page.goto('/onboarding/create');
	await page.getByLabel('Household name').fill(name);
	await page.getByLabel('Your display name').fill('Fresh');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/onboarding\/invite$/);
}

function moveHousehold(name: string, timezone: string) {
	const db = new Database(DATABASE_PATH);
	try {
		db.prepare('update households set timezone = ? where name = ?').run(timezone, name);
	} finally {
		db.close();
	}
}

test('a raccoon met on Home lands in the album, once per slot', async ({ browser, baseURL }) => {
	const api = await request.newContext({ baseURL });
	const email = `album-${Date.now()}@e2e.test`;
	const signUp = await api.post('/api/auth/sign-up/email', {
		data: { name: 'Fresh Person', email, password: 'e2e-password-album' }
	});
	expect(signUp.ok()).toBe(true);
	const context = await browser.newContext({ storageState: await api.storageState() });
	await api.dispose();
	const page = await context.newPage();

	const name = `Album ${Date.now()}`;
	await freshHousehold(page, name);

	// First visit: Home's album card names the welcome raccoon, and doesn't let
	// go of it: unlike a toast, it is still there after a reload.
	await page.goto('/home');
	const waiting = page.getByRole('link', { name: /New raccoon!/ });
	await expect(waiting).toContainText('Welcome Committee');
	await expect(waiting).toContainText('1 of 49 found');
	await page.reload();
	await expect(waiting).toBeVisible();

	// A tap opens its card.
	await waiting.click();
	await expect(page).toHaveURL(/\/settings\/raccoons\?card=welcome-a&from=home$/);
	const card = page.getByRole('dialog', { name: 'Raccoon album' });
	await expect(card.getByText('Seen 1×')).toBeVisible();
	await expect(card.getByText(/^No\. \d{3}$/)).toBeVisible();
	await expect(card.getByText('Cosiness')).toBeVisible();
	await card.getByRole('button', { name: 'Close' }).click();

	// Back goes where you came from, and the card has calmed down: looked at, and
	// the same slot again is still the welcome, seen once.
	await page.getByRole('link', { name: 'Back to Home' }).click();
	await expect(page).toHaveURL(/\/home$/);
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toContainText('1 of 49 found');
	await expect(page.getByText('New raccoon!')).toHaveCount(0);

	await page.goto('/settings');
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toContainText('1 of 49');

	// Midnight: the next slot's raccoon is the sleeping one, a second.
	moveHousehold(name, 'Pacific/Auckland');
	await page.goto('/home');
	// It is a rare one, and the card says so in words.
	await expect(page.getByRole('link', { name: /Rare raccoon!/ })).toContainText('2 of 49 found');

	// From anywhere else, back still means Settings.
	await page.goto('/settings/raccoons');
	await expect(page.getByRole('link', { name: 'Back to Settings' })).toBeVisible();
	await expect(page.getByText('2 of 49 found')).toBeVisible();
	// Met ones are named; the rest stay "not met yet", with no hint.
	await expect(
		page.getByRole('button', { name: /^No\. \d{3}, (?!not met yet)[^,]+(, new)?$/ })
	).toHaveCount(2);
	// The first was noticed when its card opened; only the sleeping one is new.
	await expect(page.getByRole('button', { name: /, new$/ })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /not met yet$/ })).toHaveCount(47);

	// One rarity at a time: Legendary is the special days and the birthday, none
	// met on an ordinary June afternoon. No Missing filter any more (→ DECISIONS #237).
	await expect(page.getByRole('button', { name: 'Missing' })).toHaveCount(0);
	await page.getByRole('button', { name: /Legendary/ }).click();
	await expect(page.getByRole('button', { name: /^No\. \d{3}, / })).toHaveCount(7);
	await expect(page.getByRole('button', { name: /not met yet$/ })).toHaveCount(7);

	// A locked card gives nothing away.
	await page
		.getByRole('button', { name: /not met yet$/ })
		.first()
		.click();
	const locked = page.getByRole('dialog', { name: 'Raccoon album' });
	await expect(locked.getByText('Not met yet')).toBeVisible();
	await expect(locked.getByText('Cosiness')).toHaveCount(0);

	await context.close();
});
