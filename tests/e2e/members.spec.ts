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
