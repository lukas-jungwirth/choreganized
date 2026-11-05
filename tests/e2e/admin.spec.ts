/**
 * Admin mode (→ plan 34, SPEC §12). The seeded owner is on the e2e server's
 * `ADMIN_EMAILS`; a fresh sign-up with a household of its own is not. What
 * matters is that the second one gets nothing: no admin mode from the taps, a
 * 404 at /admin, a poke rather than a picker, and a `?raccoon=` the server
 * ignores.
 */
import { expect, request, test, type Page } from '@playwright/test';

async function tapVersion(page: Page, times: number) {
	const version = page.getByRole('button', { name: /^Version/ });
	for (let tap = 0; tap < times; tap += 1) await version.click();
}

test('an admin turns admin mode on with seven taps, and off again', async ({ page }) => {
	// Not yet: the cookie isn't there, so the page doesn't exist.
	expect((await page.goto('/admin'))?.status()).toBe(404);

	await page.goto('/settings');
	await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
	await tapVersion(page, 7);
	await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();

	await page.getByRole('link', { name: 'Admin' }).click();
	await expect(page).toHaveURL(/\/admin$/);
	await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
	await expect(page.getByText('Active in 7 days')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Households' })).toBeVisible();

	// What the album holds before the picker (→ plan 35): a pick unlocks nothing.
	await page.goto('/settings');
	const albumBefore = await page.getByRole('link', { name: /Raccoon album/ }).textContent();

	// Home: a tap opens the picker, and a pick is what the server renders.
	await page.goto('/home');
	await page.getByRole('button', { name: 'Pick a raccoon' }).click();
	const picker = page.getByRole('dialog', { name: 'Pick a raccoon' });
	// Only Home's own raccoons: a tab's or Settings' raccoon is drawn for that job.
	await expect(picker.getByRole('button', { name: /^shopping/ })).toHaveCount(0);
	await expect(picker.getByRole('button', { name: /^move-out/ })).toHaveCount(0);
	await picker.getByRole('button', { name: /christmas/ }).click();
	await expect(page).toHaveURL(/raccoon=christmas/);
	await expect(page.locator('header img.mascot')).toHaveAttribute('src', /\/christmas/);

	await page.goto('/settings');
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toHaveText(albumBefore!);

	// Typed by hand, a section raccoon is ignored even in admin mode.
	await page.goto('/home?raccoon=shopping');
	await expect(page.locator('header img.mascot')).not.toHaveAttribute('src', /\/shopping/);

	await page.goto('/home?raccoon=christmas');
	await page.getByRole('button', { name: 'Pick a raccoon' }).click();
	await page.getByRole('button', { name: 'Back to today’s raccoon' }).click();
	await expect(page).not.toHaveURL(/raccoon=/);
	await expect(page.locator('header img.mascot')).not.toHaveAttribute('src', /\/christmas/);

	// The album shows every raccoon in admin mode (→ DECISIONS #240): no locked
	// tile, and an unmet card open but saying it isn't met. The count stays real.
	await page.goto('/settings/raccoons');
	await expect(page.getByText('Admin mode: every raccoon is shown')).toBeVisible();
	await expect(page.getByRole('button', { name: /not met yet$/ })).toHaveCount(0);
	await page.getByRole('button', { name: /^No\. 042, Christmas Baker$/ }).click();
	const card = page.getByRole('dialog', { name: 'Raccoon album' });
	await expect(card.getByRole('heading', { name: 'Christmas Baker' })).toBeVisible();
	await expect(card.getByText('Not met yet · shown in admin mode')).toBeVisible();
	await card.getByRole('button', { name: 'Close' }).click();
	await page.goto('/settings');
	await expect(page.getByRole('link', { name: /Raccoon album/ })).toHaveText(albumBefore!);

	await page.getByRole('button', { name: 'Leave admin mode' }).click();
	await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
	expect((await page.goto('/admin'))?.status()).toBe(404);

	// Out of admin mode, the unmet ones are locked again.
	await page.goto('/settings/raccoons');
	await expect(page.getByText('Admin mode: every raccoon is shown')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^No\. 042, not met yet$/ })).toBeVisible();
});

test.describe('someone not on the list', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('gets nothing from the taps, the URL or the raccoon', async ({ browser, baseURL }) => {
		const api = await request.newContext({ baseURL });
		const signUp = await api.post('/api/auth/sign-up/email', {
			data: {
				name: 'Not Admin',
				email: `not-admin-${Date.now()}@e2e.test`,
				password: 'e2e-password-fresh'
			}
		});
		expect(signUp.ok()).toBe(true);
		const context = await browser.newContext({ storageState: await api.storageState() });
		await api.dispose();
		const page = await context.newPage();

		await page.goto('/onboarding');
		await page.getByText('Create a household').click();
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByLabel('Household name').fill('Nicht-Admin-Gasse');
		await page.getByLabel('Your display name').fill('Plain');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page).toHaveURL(/\/onboarding\/invite$/);

		await page.goto('/settings');
		await tapVersion(page, 7);
		// The 404 is swallowed: no error page, no admin row, still Settings.
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

		// Forging the cookie isn't enough either: the server checks the address.
		await context.addCookies([{ name: 'admin_mode', value: '1', url: baseURL! }]);
		expect((await page.goto('/admin'))?.status()).toBe(404);

		await page.goto('/home?raccoon=christmas');
		await expect(page.locator('header img.mascot')).not.toHaveAttribute('src', /\/christmas/);
		await expect(page.getByRole('button', { name: 'Poke the raccoon' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Pick a raccoon' })).toHaveCount(0);

		await context.close();
	});
});
