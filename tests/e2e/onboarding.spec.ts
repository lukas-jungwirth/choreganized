/**
 * From a bare account to a household (→ SPEC §1.2–1.4). A brand-new sign-up
 * each run, so the journey starts where a real first sign-in does.
 */
import { expect, request, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('create a household: chooser → set up → invite → home', async ({ browser, baseURL }) => {
	const api = await request.newContext({ baseURL });
	const email = `fresh-${Date.now()}@e2e.test`;
	const signUp = await api.post('/api/auth/sign-up/email', {
		data: { name: 'Fresh Person', email, password: 'e2e-password-fresh' }
	});
	expect(signUp.ok()).toBe(true);
	const context = await browser.newContext({ storageState: await api.storageState() });
	await api.dispose();
	const page = await context.newPage();

	await page.goto('/');
	await expect(page).toHaveURL(/\/onboarding$/);
	await expect(page.getByRole('heading', { name: 'Welcome, Fresh' })).toBeVisible();

	await page.getByText('Create a household').click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/onboarding\/create$/);

	await page.getByLabel('Household name').fill('Testgasse 1');
	await page.getByLabel('Your display name').fill('Fresh');
	// The radio itself is visually hidden behind the swatch; the label takes the tap.
	await page.locator('label', { has: page.getByRole('radio', { name: 'Terracotta' }) }).click();
	await expect(page.getByRole('radio', { name: 'Terracotta' })).toBeChecked();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page).toHaveURL(/\/onboarding\/invite$/);
	await expect(page.locator('.code')).toHaveText(/^[A-Z2-9]{3}\W?[A-Z2-9]{3}$/);

	await page.goto('/');
	await expect(page).toHaveURL(/\/home$/);
	await expect(page.getByText('Testgasse 1')).toBeVisible();

	await context.close();
});
