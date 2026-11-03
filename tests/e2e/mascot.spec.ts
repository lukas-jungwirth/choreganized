/**
 * The raccoon beside each tab's title (→ SPEC intro, DECISIONS #211): every
 * tab with a pose shows it, loaded, and decorative — no name for a screen
 * reader to read out before the title — and every one has a line under the
 * title (#212).
 */
import { expect, test } from '@playwright/test';

const TABS = ['/shopping', '/cooking', '/tasks', '/tasks/history', '/expenses'];

for (const path of TABS) {
	test(`${path} shows its mascot beside the title`, async ({ page }) => {
		await page.goto(path);
		const mascot = page.locator('header.mascot img');
		await expect(mascot).toBeVisible();
		await expect(mascot).toHaveAttribute('alt', '');
		expect(
			await mascot.evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth))
		).toBeGreaterThan(0);

		const box = await mascot.boundingBox();
		expect(box?.height).toBeGreaterThanOrEqual(80);
		await expect(page.locator('header.mascot .meta')).toHaveText(/\S/);
	});
}

test('the sign-in page shows the raccoon where the logo was', async ({ browser }) => {
	const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Haushaltsheld.' })).toBeVisible();
	await expect(page.locator('.brand img')).toBeVisible();
	await page.close();
});

test('Home shows one raccoon: pointing at your next chore, or greeting you', async ({ page }) => {
	await page.goto('/home');
	// Any pose counts towards "one" — a stray seasonal raccoon beside the
	// greeting would be two. The fixed clock's ordinary June afternoon is never
	// a special day nor bedtime (→ `utils/raccoon.test.ts` covers those).
	await expect(page.locator('header img.mascot')).toHaveCount(1);
	const raccoons = page.locator('img[src*="/welcome-"], img[src*="/reminder-"]');
	await expect(raccoons).toHaveCount(1);

	const card = page.getByText('Your next chore', { exact: true });
	if (await card.isVisible()) {
		await expect(raccoons).toHaveAttribute('src', /\/reminder-(upcoming|overdue)/);
	} else {
		await expect(raccoons).toHaveAttribute('src', /\/welcome-[ab]/);
	}
	await expect(raccoons).toHaveAttribute('alt', '');
});

test('Settings has a raccoon on the profile and one over the ways out', async ({ page }) => {
	await page.goto('/settings');
	for (const pose of ['settings', 'move-out']) {
		const raccoon = page.locator(`img[src*="/${pose}"]`);
		await expect(raccoon).toHaveCount(1);
		await raccoon.scrollIntoViewIfNeeded();
		await expect(raccoon).toBeVisible();
		await expect(raccoon).toHaveAttribute('alt', '');
	}
});

test('poking the Home raccoon six times sends it away for a while, then the same one is back', async ({
	page
}) => {
	await page.goto('/home');
	const raccoon = page.getByRole('button', { name: 'Poke the raccoon' });
	const pose = raccoon.locator('img');
	const before = await pose.getAttribute('src');

	// Five pokes: a wobble, a hit, a sulk — but it stays.
	for (let poke = 0; poke < 5; poke++) await raccoon.click();
	await expect(raccoon).toHaveClass(/annoyed/);

	// The sixth: it ducks behind the card and is gone…
	await raccoon.click();
	await expect(raccoon).toBeHidden();

	// …for a few seconds, then it comes back up, calm — the same raccoon, never
	// another: which one you get is the date's, not the poker's.
	await expect(raccoon).toBeVisible({ timeout: 8000 });
	await expect(raccoon).not.toHaveClass(/annoyed/);
	await expect(pose).toHaveAttribute('src', before!);
});
