/**
 * The roster (→ SPEC §7): the owner wears the crown, the invite lives here.
 */
import { expect, test } from '@playwright/test';
import { SEED } from './accounts';

test('members lists the household in join order and crowns the owner', async ({ page }) => {
	await page.goto('/settings/members');
	const rows = page.getByRole('list').getByRole('listitem');
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(0)).toContainText('Lukas');
	await expect(rows.nth(0)).toContainText('Owner');
	await expect(rows.nth(1)).toContainText(SEED.housemate);
	await expect(rows.nth(1)).toContainText('Member');
});

test('removing a housemate says which recurring expenses stop, and Cancel keeps them', async ({
	page
}) => {
	await page.goto('/settings/members');
	await page.getByRole('list').getByRole('listitem').nth(1).getByRole('button').click();
	await page.getByRole('button', { name: /Remove from household/ }).click();

	// The seed's Strom repeats monthly and is split with the housemate.
	const confirm = page.getByRole('dialog', { name: 'Remove member' });
	await expect(confirm).toContainText(/Strom · Wien Energie.* will stop repeating\./);
	await confirm.getByRole('button', { name: 'Cancel' }).click();

	await page.goto('/expenses/recurring');
	await expect(page.getByTestId('series-row').filter({ hasText: 'Strom' })).toHaveCount(1);
});
