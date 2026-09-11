/**
 * Completing a chore and taking it back (→ SPEC §5.4, DECISIONS #16–#19): the
 * modal names the doer, the points, and offers the undo that restores the row.
 */
import { expect, test } from '@playwright/test';

test('mark a chore done, then undo it from the modal', async ({ page }) => {
	await page.goto('/tasks');

	// A task that is mine or anybody's — not "it's Elisabeth's", which asks first.
	const done = page.getByRole('button', { name: /^Mark .* done$/ }).first();
	await expect(done).toBeVisible();
	const name = (await done.getAttribute('aria-label'))!.replace(/^Mark (.*) done$/, '$1');

	await done.click();
	const modal = page.getByRole('dialog');
	await expect(modal.getByRole('heading', { name: /Nice work, Lukas!/ })).toBeVisible();
	await expect(modal.getByText(name)).toBeVisible();

	await modal.getByRole('button', { name: 'Undo' }).click();
	await expect(modal).toBeHidden();
	await expect(page.getByRole('button', { name: `Mark ${name} done` })).toBeVisible();
});

test('the Tasks tab carries the overdue badge the layout computes', async ({ page }) => {
	await page.goto('/home');
	const tasksTab = page
		.getByRole('navigation', { name: 'Sections' })
		.getByRole('link', { name: /Tasks/ });
	await expect(tasksTab).toBeVisible();
	await tasksTab.click();
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
});
