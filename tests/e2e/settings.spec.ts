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

	await expect(page.getByText(/Thanks! That’s saved/)).toBeVisible();
});

test('the About row names the build the tests run against', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByText('e2e', { exact: true })).toBeVisible();
});

test('tapping the version copies it, then reverts', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/settings');

	await page.getByRole('button', { name: /^Version/ }).click();
	await expect(page.getByText('Copied', { exact: true })).toBeVisible();
	await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe('e2e');

	await expect(page.getByText('e2e', { exact: true })).toBeVisible();
});

/** Austrian wording is gone (→ plan 44, DECISIONS #317): no row, for the owner or anyone. */
test('Settings has no recipe wording row', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByRole('button', { name: /^Version/ })).toBeVisible();
	await expect(page.getByText('Recipe wording')).toHaveCount(0);
});

/**
 * A display name is 20 characters at most (→ DECISIONS #267): the field stops
 * typing there, and the server refuses a 21st that gets past it.
 */
test('a display name takes 20 characters and refuses 21', async ({ page }) => {
	await page.goto('/settings');
	const row = page.getByRole('button', { name: /^Display name/ });
	const sheet = page.getByRole('dialog');
	const field = sheet.getByLabel('Display name');

	await row.click();
	const original = await field.inputValue();
	await expect(field).toHaveAttribute('maxlength', '20');

	try {
		// Past the attribute, the way an old client or a script would send it.
		await field.evaluate((input) => input.removeAttribute('maxlength'));
		await field.fill('Bartholomäus Grünwald');
		expect('Bartholomäus Grünwald').toHaveLength(21);
		await sheet.getByRole('button', { name: 'Save changes' }).click();
		await expect(sheet.getByText('Keep it under 20 characters.')).toBeVisible();

		await field.fill('Bartholomäus Grünwal');
		await sheet.getByRole('button', { name: 'Save changes' }).click();
		await expect(sheet).toBeHidden();
		await expect(row).toContainText('Bartholomäus Grünwal');
	} finally {
		await page.goto('/settings');
		await row.click();
		await field.fill(original);
		await sheet.getByRole('button', { name: 'Save changes' }).click();
		await expect(sheet).toBeHidden();
	}
	await expect(row).toContainText(original);
});

test('a birthday is day and month, shown on its row, and cleared again', async ({ page }) => {
	await page.goto('/settings');
	const row = page.getByRole('button', { name: /^Birthday/ });
	await expect(row).toContainText('Not set');

	await row.click();
	const sheet = page.getByRole('dialog');
	await sheet.getByLabel('Month').selectOption('3');
	await sheet.getByLabel('Day').selectOption('14');
	await sheet.getByRole('button', { name: 'Save changes' }).click();
	await expect(sheet).toBeHidden();
	await expect(row).toContainText('March 14');

	await page.reload();
	await expect(row).toContainText('March 14');

	// Half a birthday is refused, with the reason under the birthday.
	await row.click();
	await sheet.getByLabel('Day').selectOption('');
	await sheet.getByRole('button', { name: 'Save changes' }).click();
	await expect(sheet.getByRole('alert')).toContainText('Pick a day and a month');

	await sheet.getByLabel('Month').selectOption('');
	await sheet.getByRole('button', { name: 'Save changes' }).click();
	await expect(sheet).toBeHidden();
	await expect(row).toContainText('Not set');
});
