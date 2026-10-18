/**
 * Library → recipe → cook mode (→ SPEC §4.3, §4.5, §4.6): the deep-linkable
 * routes, stepped through the way a phone on the counter does.
 */
import { expect, test } from '@playwright/test';
import { SEED } from './accounts';

test('open a recipe and step through cook mode', async ({ page }) => {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.curry) })
		.first()
		.click();
	await expect(page).toHaveURL(/\/cooking\/recipes\/[^/]+$/);
	await expect(page.getByRole('heading', { name: SEED.recipes.curry, level: 1 })).toBeVisible();

	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page).toHaveURL(/\/cook$/);
	await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByText(/^Step 2 of \d+$/)).toBeVisible();

	// Cook mode is the one dark screen whatever the theme (→ SPEC §10): the
	// browser chrome for the *light* scheme is the dark cook surface, not the
	// app's cream (`CHROME.cookBg` in src/lib/theme.ts).
	await expect(
		page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
	).toHaveAttribute('content', '#22201C');
});

test('the week shows this week and next', async ({ page }) => {
	await page.goto('/cooking');
	await expect(page.getByRole('heading', { name: 'Cooking', level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: /Browse all/ })).toBeVisible();
});

test('a step’s own timer, set in the form, is the one cook mode offers by name', async ({
	page
}) => {
	await page.goto('/cooking/recipes/new');
	await page.getByLabel('Recipe name').fill('E2E Nudeln');
	await page.getByLabel('Ingredient 1', { exact: true }).fill('200 g Nudeln');
	await page.getByLabel('Step 1', { exact: true }).fill('Die Nudeln 9 Minuten kochen.');

	// The German duration is read out of the text before anyone sets anything.
	const chip = page.getByRole('button', { name: 'Timer for step 1' });
	await expect(chip).toContainText('9:00');
	await expect(chip).toContainText('auto');

	await chip.click();
	const sheet = page.getByRole('dialog');
	await expect(sheet.getByLabel('Minutes', { exact: true })).toHaveValue('9');
	await sheet.getByLabel('Minutes', { exact: true }).fill('10');
	await sheet.getByRole('button', { name: 'Nudeln', exact: true }).click();
	await sheet.getByRole('button', { name: 'Save timer' }).click();
	await expect(chip).toContainText('Nudeln · 10:00');

	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'E2E Nudeln', level: 1 })).toBeVisible();
	await expect(page.getByText('Nudeln · 10:00')).toBeVisible();

	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page.getByRole('button', { name: 'Start Nudeln · 10:00' })).toBeVisible();

	// And taken away again, the step goes back to reading its own text.
	await page.goto(page.url().replace(/\/cook$/, '/edit'));
	await page.getByRole('button', { name: 'Timer for step 1' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove timer' }).click();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page.getByRole('button', { name: 'Start 9:00 timer' })).toBeVisible();
});
