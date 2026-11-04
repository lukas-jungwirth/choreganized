/**
 * The raccoon album (→ plan 35): meeting a raccoon on Home puts it in your
 * album, once per slot of the day. A brand-new household, so the album starts
 * empty and Home shows an everyday pose (no chores are on anyone yet).
 *
 * The next slot comes from the household's timezone rather than the clock:
 * every run is the same Vienna afternoon (→ TESTING.md "The fixed clock"), and
 * Tokyo is seven hours ahead of it, which is the same day's evening there.
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

	// First visit: the toast, and View opens that raccoon's card.
	await page.goto('/home');
	const toast = page.getByRole('status').filter({ hasText: 'New raccoon!' });
	await expect(toast).toBeVisible();
	await expect(toast).toContainText('is in your album · 1 of 44');
	await toast.getByRole('link', { name: 'View' }).click();
	await expect(page).toHaveURL(/\/settings\/raccoons\?card=[a-z-]+$/);
	const card = page.getByRole('dialog', { name: 'Raccoon album' });
	await expect(card.getByText('Seen 1×')).toBeVisible();
	await expect(card.getByText(/^No\. \d{3}$/)).toBeVisible();
	await expect(card.getByText('Cosiness')).toBeVisible();
	await card.getByRole('button', { name: 'Close' }).click();

	// The same slot again: no toast, and still seen once.
	await page.goto('/home');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByText('New raccoon!')).toHaveCount(0);

	await page.goto('/settings');
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toContainText('1 of 44');

	// Evening: the next slot's raccoon is a second one.
	moveHousehold(name, 'Asia/Tokyo');
	await page.goto('/home');
	await expect(page.getByRole('status').filter({ hasText: 'New raccoon!' })).toContainText(
		'2 of 44'
	);

	await page.goto('/settings/raccoons');
	await expect(page.getByText('2 of 44 found')).toBeVisible();
	// Met ones are named; the rest stay "not met yet", with no hint.
	await expect(
		page.getByRole('button', { name: /^No\. \d{3}, (?!not met yet)[^,]+(, new)?$/ })
	).toHaveCount(2);
	// The first was on screen when View opened the album; only the evening one is new.
	await expect(page.getByRole('button', { name: /, new$/ })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /not met yet$/ })).toHaveCount(42);

	// Missing on top of a tier: the seasonal ones still to find.
	await page.getByRole('button', { name: /Seasonal/ }).click();
	await page.getByRole('button', { name: 'Missing' }).click();
	await expect(page.getByRole('button', { name: /not met yet$/ }).first()).toBeVisible();
	await expect(page.getByRole('button', { name: /, new$/ })).toHaveCount(0);

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
