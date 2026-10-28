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

test('a monthly expense logged late catches up, then edits and stops as a series', async ({
	page
}) => {
	const name = `Internet ${Date.now().toString(36)}`;
	// Forty days back: its next occurrence is already due, the one after isn't
	// — so the sweep has exactly one copy to add, whatever today is.
	const started = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);

	await page.goto('/expenses');
	await page.getByRole('button', { name: 'Add expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	await sheet.getByLabel('Amount').fill('39.90');
	await sheet.getByLabel('What for?').fill(name);
	await sheet.getByRole('textbox', { name: /^Date/ }).fill(started);
	await sheet.getByRole('combobox', { name: /^Repeats/ }).selectOption('month-1');
	await expect(sheet.getByRole('combobox', { name: /^Repeats/ })).toHaveValue('month-1');
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();

	const rows = () =>
		page
			.goto(`/expenses/history?q=${encodeURIComponent(name)}&from=${started}`)
			.then(() => page.getByRole('link', { name: new RegExp(name) }).count());
	expect(await rows()).toBe(1);

	// The 06:00 sweep, run now: this month's copy appears — and only once.
	for (let run = 0; run < 2; run++) {
		const swept = await page.request.post('/api/e2e/recurring-expenses');
		expect(swept.ok()).toBe(true);
	}
	expect(await rows()).toBe(2);
	await expect(
		page
			.getByRole('link', { name: new RegExp(name) })
			.first()
			.getByRole('img', { name: 'Repeats' })
	).toBeVisible();

	// Recurring [9h]: edit the series — the logged two keep their amount.
	await page.goto('/expenses');
	await page.getByRole('button', { name: 'More' }).click();
	await page.getByRole('menuitem', { name: /Recurring/ }).click();
	await page.getByTestId('series-row').filter({ hasText: name }).click();
	const series = page.getByRole('dialog', { name });
	await series.getByRole('button', { name: /Edit series/ }).click();
	const edit = page.getByRole('dialog', { name: 'Edit series' });
	await edit.getByLabel('Amount').fill('44.90');
	await edit.getByRole('button', { name: 'Save changes' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByTestId('series-row').filter({ hasText: name })).toContainText('€44.90');

	await page.goto(`/expenses/history?q=${encodeURIComponent(name)}&from=${started}`);
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(2);
	await expect(page.getByRole('link', { name: /€44\.90/ })).toHaveCount(0);

	// Stop repeating: the series leaves the list, its expenses stay.
	await page.goto('/expenses/recurring');
	await page.getByTestId('series-row').filter({ hasText: name }).click();
	await page
		.getByRole('dialog', { name })
		.getByRole('button', { name: /Stop repeating/ })
		.click();
	await expect(page.getByTestId('series-row').filter({ hasText: name })).toHaveCount(0);
	expect(await rows()).toBe(2);
});

// Lukas's two asks on Recurring [9h] (→ SPEC §11.9): start a series from the
// screen itself, and repeat it on any count of weeks, months or years.
test('start a series from Recurring every 2 months, then make it quarterly', async ({ page }) => {
	const name = `Insurance ${Date.now().toString(36)}`;

	await page.goto('/expenses/recurring');
	await page.getByRole('button', { name: 'New recurring expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	const repeats = sheet.getByRole('combobox', { name: /^Repeats/ });
	await expect(repeats).toHaveValue('month-1');
	await sheet.getByLabel('Amount').fill('120');
	await sheet.getByLabel('What for?').fill(name);
	await repeats.selectOption('custom');
	await sheet.getByRole('button', { name: 'Increase every' }).click();
	await expect(sheet.getByRole('spinbutton', { name: 'Every' })).toHaveValue('3');
	await sheet.getByRole('button', { name: 'Decrease every' }).click();
	await expect(sheet.getByRole('combobox', { name: 'Unit' })).toHaveValue('month');
	await expect(sheet.getByText('Every 2 months')).toBeVisible();
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();

	// Logged today as the first one; the list names the cadence and the next.
	const row = page.getByTestId('series-row').filter({ hasText: name });
	await expect(row).toContainText('Every 2 months · next');
	await row.click();
	const series = page.getByRole('dialog', { name });
	await expect(series).toContainText(/Every 2 months on the \d+(st|nd|rd|th)/);

	// Edit series opens on the custom pair; Quarterly is one of the quick choices.
	await series.getByRole('button', { name: /Edit series/ }).click();
	const edit = page.getByRole('dialog', { name: 'Edit series' });
	await expect(edit.getByRole('combobox', { name: /^Repeats/ })).toHaveValue('custom');
	await expect(edit.getByRole('spinbutton', { name: 'Every' })).toHaveValue('2');
	await edit.getByRole('combobox', { name: /^Repeats/ }).selectOption('month-3');
	await edit.getByRole('button', { name: 'Save changes' }).click();
	await expect(edit).toBeHidden();
	await expect(row).toContainText('Quarterly · next');

	// Tidy up: other runs share the household.
	await row.click();
	await page
		.getByRole('dialog', { name })
		.getByRole('button', { name: /Stop repeating/ })
		.click();
	await expect(row).toHaveCount(0);
});

// All activity's filters [9f] (→ SPEC §11.12): each chip opens its own sheet
// and a pick applies at once; the sliders open all three, and stay open.
test('narrow All activity by time, payer and categories, then clear it', async ({ page }) => {
	await page.goto('/expenses/history');

	// Time: "This month" names the month and groups the list by day.
	await page.getByRole('button', { name: 'All time' }).click();
	const time = page.getByRole('dialog', { name: 'Time' });
	await time.getByRole('radio', { name: /^This month/ }).click();
	await expect(time).toBeHidden();
	await expect(page).toHaveURL(/\?time=thisMonth$/);
	await expect(page.getByRole('button', { name: 'June', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible();

	// Paid by: who paid — the seeded pizza was Elisabeth's.
	await page.getByRole('button', { name: 'Any payer' }).click();
	await page.getByRole('dialog', { name: 'Paid by' }).getByRole('radio', { name: 'You' }).click();
	await expect(page.getByRole('button', { name: 'Paid by you' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Pizza at Riva/ })).toHaveCount(0);
	await expect(page.getByRole('link', { name: /Weekly shop · Billa/ }).first()).toBeVisible();

	// Category: several can be ticked, and the sheet stays open for them.
	await page.getByRole('button', { name: 'All categories' }).click();
	const category = page.getByRole('dialog', { name: 'Category' });
	await category.getByRole('checkbox', { name: 'Groceries' }).click();
	await category.getByRole('checkbox', { name: 'Eating out' }).click();
	await expect(category.getByRole('checkbox', { name: 'Eating out' })).toBeChecked();
	await category.getByRole('button', { name: /^Show \d+ expenses?$/ }).click();
	await expect(category).toBeHidden();
	await expect(page).toHaveURL(/category=groceries&category=eatingOut$/);
	await expect(page.getByRole('button', { name: 'Groceries +1' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Dish soap/ })).toHaveCount(0);
	await expect(page.getByText(/^\d+ expenses? · €/)).toBeVisible();

	// A set chip's × clears that filter alone.
	await page.getByRole('link', { name: 'Clear Paid by you' }).click();
	await expect(page).toHaveURL(/\?time=thisMonth&category=groceries&category=eatingOut$/);
	await expect(page.getByRole('button', { name: 'Any payer' })).toBeVisible();

	await page.getByRole('link', { name: 'Clear all' }).click();
	await expect(page.getByRole('button', { name: 'All time' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'All categories' })).toBeVisible();

	// All filters: a pick applies and the sheet stays for the next one —
	// picked dates included, which open right there.
	await page.getByRole('button', { name: 'All filters' }).click();
	const all = page.getByRole('dialog', { name: 'All filters' });
	await all.getByRole('button', { name: 'Payments' }).click();
	await expect(page).toHaveURL(/\?category=payments$/);
	await all.getByRole('button', { name: 'Pick dates' }).click();
	await all.getByLabel('From').fill('2036-06-01');
	await expect(page).toHaveURL(/\?time=custom&start=2036-06-01&category=payments$/);
	await expect(all.getByRole('button', { name: 'From Jun 1' })).toBeVisible();
	const show = all.getByRole('button', { name: /^Show \d+ payments?$/ });
	await expect(show).toBeVisible();
	await show.click();
	await expect(all).toBeHidden();
	await expect(page.getByRole('button', { name: 'Payments', exact: true })).toBeVisible();
});
