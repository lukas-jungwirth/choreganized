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
