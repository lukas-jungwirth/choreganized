/**
 * The shopping list (→ SPEC §3.1): add, tick, undo — the three things a hand
 * in a supermarket does.
 */
import { expect, test } from '@playwright/test';
import { SEED } from './accounts';

test('add an item, tick it off, undo, tick again', async ({ page }) => {
	await page.goto('/shopping');
	await expect(page.getByText(SEED.items[0])).toBeVisible();

	const name = `Pears ${Date.now().toString(36)}`;
	const field = page.getByPlaceholder('Add an item…');
	await field.fill(name);
	await field.press('Enter');
	await expect(page.getByText(name)).toBeVisible();

	await page.getByRole('button', { name: `Check off ${name}` }).click();
	const undo = page.getByRole('status').getByRole('button', { name: 'Undo' });
	await expect(undo).toBeVisible();
	await undo.click();
	await expect(page.getByRole('button', { name: `Check off ${name}` })).toBeVisible();

	await page.getByRole('button', { name: `Check off ${name}` }).click();
	await expect(page.getByRole('button', { name: `Put ${name} back on the list` })).toBeVisible();
});

test('the seeded stores are the groups', async ({ page }) => {
	await page.goto('/shopping');
	for (const store of SEED.stores) {
		await expect(page.getByRole('heading', { name: store })).toBeVisible();
	}
});
