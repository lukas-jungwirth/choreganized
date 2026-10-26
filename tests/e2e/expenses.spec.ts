/**
 * Expenses (→ SPEC §11, plan 29): log one, split it two ways, settle up, find
 * it again, and take a delete back — the tab's whole round trip, through the
 * sheets a thumb uses.
 *
 * The seeded household already has a week of spending, and other runs may
 * have added to it, so the journey reads the balance it starts from rather
 * than assuming one: what is checked is that each step moves it by exactly
 * what that step should.
 */
import { expect, test, type Page } from '@playwright/test';

/** The balance card's number, in cents, signed: owed is positive. */
async function balance(page: Page): Promise<number> {
	const card = page.getByTestId('balance-card');
	await card.waitFor();
	const text = await card.innerText();
	if (text.includes('All settled up')) return 0;
	const match = text.match(/€([\d,]+)\.(\d{2})/);
	if (!match) throw new Error(`no amount on the card: ${text}`);
	const cents = Number(match[1].replace(/,/g, '')) * 100 + Number(match[2]);
	return text.includes('You owe') ? -cents : cents;
}

test('log a split expense, settle up, find it, delete and undo', async ({ page }) => {
	await page.goto('/expenses');
	const before = await balance(page);
	const name = `Groceries ${Date.now().toString(36)}`;

	// Amount → what for → Save: the default split and "paid by you" do the rest.
	await page.getByRole('button', { name: 'Add expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	await sheet.getByLabel('Amount').fill('30,00');
	await sheet.getByLabel('What for?').fill(name);

	// 30 / 70 by percent — typing one fills the other.
	await sheet.getByRole('button', { name: /^Split/ }).click();
	const split = page.getByRole('dialog', { name: 'Split' });
	await split.getByRole('tab', { name: '%', exact: true }).click();
	const inputs = split.getByRole('textbox');
	await inputs.first().fill('30');
	await expect(inputs.nth(1)).toHaveValue('70');
	await expect(split.getByText('Adds up to 100%')).toBeVisible();
	await split.getByRole('button', { name: 'Done' }).click();
	await expect(sheet.getByText('By % · ')).toBeVisible();
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();

	// Paid €30.00, my share €9.00: I'm owed €21.00 more than before.
	await expect.poll(() => balance(page)).toBe(before + 2100);
	await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('€21.00');

	// Settle the whole house: one payment, and the card says so.
	await page
		.getByRole('button', { name: /^Settle up/ })
		.first()
		.click();
	const settle = page.getByRole('dialog', { name: 'Settle up' });
	await settle.getByRole('button', { name: 'Record payment' }).click();
	await expect(settle).toBeHidden();
	await expect(page.getByTestId('balance-card')).toContainText('All settled up');

	// History finds it by a word inside the description, case aside.
	await page.goto(`/expenses/history?q=${encodeURIComponent(name.toUpperCase())}`);
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(1);

	// Delete from the detail, then take it back from the tab's undo bar.
	await page.getByRole('link', { name: new RegExp(name) }).click();
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Delete expense' }).click();
	await expect(page).toHaveURL(/\/expenses$/);
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(1);
	await expect(page.getByTestId('balance-card')).toContainText('All settled up');
});
