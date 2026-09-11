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
