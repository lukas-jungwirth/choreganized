/**
 * The raccoon album (→ plan 35): meeting a raccoon on Home puts it in your
 * album, once per slot of the day. A brand-new household, so the album starts
 * empty and Home shows an everyday pose (no chores are on anyone yet).
 *
 * The first look is always the welcome raccoon (→ DECISIONS #238). The next
 * slot comes from the household's timezone rather than the clock: every run is
 * the same Vienna afternoon (→ TESTING.md "The fixed clock"), and Noumea is
 * nine hours ahead of it, which is 23:00 there: the sleeping raccoon. Not
 * midnight: from 00:00 to 02:00 it might be the midnight raccoon instead.
 */
import Database from 'better-sqlite3';
import { expect, request, test, type Browser, type Locator, type Page } from '@playwright/test';
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

/** Signed up, with no household yet. */
async function newPerson(browser: Browser, baseURL: string | undefined) {
	const api = await request.newContext({ baseURL });
	const email = `album-${Date.now()}@e2e.test`;
	const signUp = await api.post('/api/auth/sign-up/email', {
		data: { name: 'Fresh Person', email, password: 'e2e-password-album' }
	});
	expect(signUp.ok()).toBe(true);
	const context = await browser.newContext({ storageState: await api.storageState() });
	await api.dispose();
	return { context, page: await context.newPage() };
}

/** A press that turns into a scroll: it starts on the link and never opens it. */
async function pressWithoutOpening(page: Page, link: Locator) {
	await link.hover();
	await page.mouse.down();
	await page.mouse.move(0, 0);
	await page.mouse.up();
	await page.waitForTimeout(300);
}

test('a raccoon met on Home lands in the album, once per slot', async ({ browser, baseURL }) => {
	const { context, page } = await newPerson(browser, baseURL);

	const name = `Album ${Date.now()}`;
	await freshHousehold(page, name);

	// First visit: Home's album card names the welcome raccoon, and doesn't let
	// go of it: unlike a toast, it is still there after a reload.
	await page.goto('/home');
	const waiting = page.getByRole('link', { name: /New raccoon!/ });
	await expect(waiting).toContainText('Welcome Committee');
	await expect(waiting).toContainText('1 of 53 found');
	await page.reload();
	await expect(waiting).toBeVisible();

	// A press that turns into a scroll doesn't use it up either: "tap" preloading
	// would run the album's load, which clears what's new.
	await pressWithoutOpening(page, waiting);
	await page.reload();
	await expect(waiting).toBeVisible();

	// The same goes for the way in from Settings (→ DECISIONS #247).
	await page.goto('/settings');
	await pressWithoutOpening(page, page.getByRole('link', { name: /Raccoon album/ }));
	await expect(page).toHaveURL(/\/settings$/);
	await page.goto('/home');
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
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toContainText('1 of 53 found');
	await expect(page.getByText('New raccoon!')).toHaveCount(0);

	await page.goto('/settings');
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toContainText('1 of 53');

	// 23:00: the next slot's raccoon is the sleeping one, a second.
	moveHousehold(name, 'Pacific/Noumea');
	await page.goto('/home');
	// It is a rare one, and the card says so in words.
	await expect(page.getByRole('link', { name: /Rare raccoon!/ })).toContainText('2 of 53 found');

	// From anywhere else, back still means Settings.
	await page.goto('/settings/raccoons');
	await expect(page.getByRole('link', { name: 'Back to Settings' })).toBeVisible();
	await expect(page.getByText('2 of 53 found')).toBeVisible();
	// Met ones are named; the rest stay "not met yet", with no hint.
	await expect(
		page.getByRole('button', { name: /^No\. \d{3}, (?!not met yet)[^,]+(, new)?$/ })
	).toHaveCount(2);
	// The first was noticed when its card opened; only the sleeping one is new.
	await expect(page.getByRole('button', { name: /, new$/ })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /not met yet$/ })).toHaveCount(51);

	// One rarity at a time: Legendary is the special days, the birthday and the
	// midnight raccoon, none met on an ordinary June afternoon. No Missing filter any more (→ DECISIONS #237).
	await expect(page.getByRole('button', { name: 'Missing' })).toHaveCount(0);
	await page.getByRole('button', { name: /Legendary/ }).click();
	await expect(page.getByRole('button', { name: /^No\. \d{3}, / })).toHaveCount(8);
	await expect(page.getByRole('button', { name: /not met yet$/ })).toHaveCount(8);

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

test('several raccoons waiting: Home says how many, and opens the album', async ({
	browser,
	baseURL
}) => {
	const { context, page } = await newPerson(browser, baseURL);
	const name = `Several ${Date.now()}`;
	await freshHousehold(page, name);

	// Two slots, and the album not opened in between: the welcome, then the sleeping one.
	await page.goto('/home');
	moveHousehold(name, 'Pacific/Noumea');
	await page.goto('/home');

	const waiting = page.getByRole('link', { name: /New raccoons!/ });
	await expect(waiting).toContainText('2 in your album');
	await expect(waiting).toContainText('Night Shift and Welcome Committee · 2 of 53');
	await expect(waiting).toContainText('2 new');

	// Not one card, since there are two: the album, wearing both badges.
	await waiting.click();
	await expect(page).toHaveURL(/\/settings\/raccoons\?from=home$/);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /, new$/ })).toHaveCount(2);

	await page.getByRole('link', { name: 'Back to Home' }).click();
	await expect(page).toHaveURL(/\/home$/);
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toContainText('2 of 53 found');

	await context.close();
});
