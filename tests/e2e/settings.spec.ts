/**
 * Settings (→ SPEC §6, §9): the language switch has to change the document,
 * not just the copy, and feedback has to be a receipt (→ DECISIONS #136).
 */
import { expect, test } from '@playwright/test';

test.describe('language', () => {
	// Every other test reads English. The restore runs as a hook rather than in a
	// `finally`, because a test that times out has its page torn down before a
	// `finally` could click anything — and posts the form action directly, so
	// no German-side selector can stop it either.
	test.afterEach(async ({ page, baseURL }) => {
		const restored = await page.request.post('/settings?/language', {
			form: { locale: 'en' },
			headers: { origin: baseURL! },
			maxRedirects: 0
		});
		expect([200, 303]).toContain(restored.status());
	});

	test('switching to German changes <html lang> and every word, and back', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');

		await page.getByRole('button', { name: /^Language/ }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Deutsch', exact: true }).click();

		// `de-AT`: the document names the variety, the catalog only the language (→ HTML_LANG).
		await expect(page.locator('html')).toHaveAttribute('lang', /^de/);
		await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();

		await page.getByRole('button', { name: /^Sprache/ }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
	});
});

test('feedback is saved even though no GitHub token is configured', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Send feedback' }).click();

	const sheet = page.getByRole('dialog');
	await sheet.getByRole('textbox').fill('E2E: the list jumped back to the top.');
	await sheet.getByRole('button', { name: 'Send' }).click();

	await expect(page.getByText(/Thanks — that’s saved/)).toBeVisible();
});

test('the About row names the build the tests run against', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByText(/^e2e(\+[0-9a-f]{7})?$/)).toBeVisible();
});
