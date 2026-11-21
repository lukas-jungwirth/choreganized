/**
 * Guests in Expenses (→ plan 38 step 1, SPEC §11.15): add a guest from the
 * split sheet, save, see them on the balance card and open their sheet; add
 * one from the payer picker; then, settled, remove both from Expense settings.
 * And step 2: copy a guest's link, open it with no session, read the balance
 * and the share; replace the link and see the old one answer [G8].
 *
 * The journey removes what it adds. Should it fail half-way, `afterEach`
 * takes its guests and their expenses out of the database, so the card the
 * other journeys read is the one they expect.
 */
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { DATABASE_PATH } from './accounts';

const tag = Date.now().toString(36).slice(-4);
const JONAS = `Jonas ${tag}`;
const ANNA = `Anna ${tag}`;
const MARCO = `Marco ${tag}`;

test.afterEach(() => {
	const db = new Database(DATABASE_PATH);
	try {
		const guests = db
			.prepare(`SELECT id FROM ledger_people WHERE kind = 'guest' AND name IN (?, ?, ?)`)
			.all(JONAS, ANNA, MARCO) as { id: string }[];
		for (const { id } of guests) {
			db.prepare(
				`DELETE FROM expenses WHERE paid_by_id = ? OR id IN (SELECT expense_id FROM expense_shares WHERE person_id = ?)`
			).run(id, id);
			db.prepare('DELETE FROM ledger_people WHERE id = ?').run(id);
		}
	} finally {
		db.close();
	}
});

test('add a guest from the split sheet and the payer picker, see them on the card, remove them once settled', async ({
	page
}) => {
	const what = `Dinner in Bozen ${tag}`;
	await page.goto('/expenses');

	// [G1] → [G2]: the split sheet's last row adds a guest, who comes back ticked in.
	await page.getByRole('button', { name: 'Add expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	await sheet.getByLabel('Amount').fill('90');
	await sheet.getByLabel('What for?').fill(what);
	await sheet.getByRole('button', { name: /^Split/ }).click();
	const split = page.getByRole('dialog', { name: 'Split' });
	await split.getByRole('button', { name: 'Add a guest' }).click();
	const add = page.getByRole('dialog', { name: 'Add a guest' });
	await add.getByLabel('Name').fill(JONAS);
	await add.getByRole('button', { name: `Add ${JONAS}` }).click();
	await expect(add).toBeHidden();
	await expect(split.getByRole('checkbox', { name: `${JONAS} is in this` })).toBeChecked();
	await expect(split.getByText('Guest', { exact: true })).toBeVisible();
	// A guest is never part of the default: the link isn't offered with one ticked in.
	await expect(split.getByRole('button', { name: 'Make this the household default' })).toHaveCount(
		0
	);
	await split.getByRole('button', { name: 'Done' }).click();
	await expect(sheet.getByText(/3 people/)).toBeVisible();
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();

	// [G3]: Jonas owes his third, and the card leads to his sheet [G5].
	const card = page.getByTestId('balance-card');
	await expect(card).toContainText(JONAS);
	await card.getByRole('button', { name: new RegExp(`^${JONAS}(, guest|’s page)`) }).click();
	const guest = page.getByRole('dialog', { name: JONAS });
	await expect(guest).toContainText('Guest · owes €30.00');
	await expect(guest.getByRole('button', { name: 'Remove guest' })).toBeDisabled();
	await expect(guest).toContainText(`Possible once ${JONAS} is settled up.`);
	await guest.getByRole('button', { name: 'Close' }).click();
	await expect(guest).toBeHidden();

	// "Someone else…" in the payer picker: closed without adding, the payer stays…
	await page.getByRole('button', { name: 'Add expense' }).click();
	const payer = sheet.getByRole('combobox', { name: 'Paid by' });
	await payer.selectOption({ label: 'Someone else…' });
	await expect(add).toBeVisible();
	await add.getByRole('button', { name: 'Close' }).click();
	await expect(add).toBeHidden();
	await expect(payer.locator('option:checked')).toHaveText('You');
	// …and with a guest added, the guest paid.
	await payer.selectOption({ label: 'Someone else…' });
	await add.getByLabel('Name').fill(ANNA);
	await add.getByRole('button', { name: `Add ${ANNA}` }).click();
	await expect(add).toBeHidden();
	await expect(payer.locator('option:checked')).toHaveText(ANNA);
	await sheet.getByRole('button', { name: 'Close' }).click();
	await expect(sheet).toBeHidden();

	// Settled (the dinner deleted), both can go: Expense settings → Guests [G4] [G5].
	await page.getByRole('link', { name: new RegExp(what) }).click();
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Delete expense' }).click();
	await expect(page).toHaveURL(/\/expenses$/);

	for (const name of [JONAS, ANNA]) {
		await page.getByRole('button', { name: 'More' }).click();
		await page.getByRole('menuitem', { name: 'Expense settings' }).click();
		const settings = page.getByRole('dialog', { name: 'Expenses' });
		await settings.getByRole('button', { name: new RegExp(`^${name}`) }).click();
		const one = page.getByRole('dialog', { name });
		await expect(one).toContainText('Guest · settled up');
		await one.getByRole('button', { name: 'Remove guest' }).click();
		await page
			.getByRole('dialog', { name: 'Remove guest' })
			.getByRole('button', { name: 'Remove guest' })
			.click();
		await expect(one).toBeHidden();
		await expect(settings.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0);
		await settings.getByRole('button', { name: 'Close' }).click();
		await expect(settings).toBeHidden();
	}

	// Gone from the pickers. (A fresh load: the delete's undo bar stands the FAB down.)
	await page.goto('/expenses');
	await page.getByRole('button', { name: 'Add expense' }).click();
	await expect(payer.locator('option', { hasText: ANNA })).toHaveCount(0);
});

test('copy a guest’s link, open it signed out, then replace it and see the old one stop', async ({
	page,
	context,
	browser,
	baseURL
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	const what = `Pizza in Meran ${tag}`;

	// A guest who owes their third of €90.
	await page.goto('/expenses');
	await page.getByRole('button', { name: 'Add expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	await sheet.getByLabel('Amount').fill('90');
	await sheet.getByLabel('What for?').fill(what);
	await sheet.getByRole('button', { name: /^Split/ }).click();
	const split = page.getByRole('dialog', { name: 'Split' });
	await split.getByRole('button', { name: 'Add a guest' }).click();
	const add = page.getByRole('dialog', { name: 'Add a guest' });
	await add.getByLabel('Name').fill(MARCO);
	await add.getByRole('button', { name: `Add ${MARCO}` }).click();
	await expect(add).toBeHidden();
	await split.getByRole('button', { name: 'Done' }).click();
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();

	// [G5]: Copy makes the link and puts it on the clipboard.
	const card = page.getByTestId('balance-card');
	await card.getByRole('button', { name: new RegExp(`^${MARCO}(, guest|’s page)`) }).click();
	const guest = page.getByRole('dialog', { name: MARCO });
	await guest.getByRole('button', { name: 'Copy', exact: true }).click();
	await expect(guest.getByRole('status')).toHaveText('Link copied');
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(link).toMatch(new RegExp(`^${baseURL}/g/[A-Za-z0-9_-]{43}$`));

	// [G6] with no session at all: the balance and the share, and nothing to do.
	const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	try {
		const outside = await stranger.newPage();
		const response = await outside.goto(link);
		expect(response?.status()).toBe(200);
		expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
		expect(response?.headers()['referrer-policy']).toBe('no-referrer');
		expect(response?.headers()['cache-control']).toBe('private, no-store');
		await expect(outside.getByRole('heading', { level: 1 })).toHaveText(`Hi ${MARCO}`);
		await expect(outside.getByTestId('guest-balance')).toContainText(/You owe \S+ €30\.00/);
		const row = outside.getByRole('listitem').filter({ hasText: what });
		await expect(row).toContainText('your share');
		await expect(row).toContainText('€30.00');
		// Only what Marco is part of: the household's own week isn't there.
		await expect(outside.getByText('Weekly shop · Billa')).toHaveCount(0);
		await expect(outside.locator('form')).toHaveCount(0);
		await expect(outside.locator('link[rel="manifest"]')).toHaveCount(0);

		// "Make a new link", one confirm: the old address answers [G8], the new one works.
		await guest.getByRole('button', { name: 'Make a new link' }).click();
		await page
			.getByRole('dialog', { name: 'Make a new link' })
			.getByRole('button', { name: 'Make a new link' })
			.click();
		await expect(guest.getByRole('status')).toHaveText('New link made');
		await guest.getByRole('button', { name: 'Copy', exact: true }).click();
		await expect(guest.getByRole('status')).toHaveText('Link copied');
		const renewed = await page.evaluate(() => navigator.clipboard.readText());
		expect(renewed).not.toBe(link);

		const dead = await outside.goto(link);
		expect(dead?.status()).toBe(404);
		await expect(outside.getByRole('heading', { level: 1 })).toHaveText(
			'This link no longer works'
		);
		await expect(outside.getByText(MARCO)).toHaveCount(0);
		expect((await outside.goto(renewed))?.status()).toBe(200);
	} finally {
		await stranger.close();
	}
});
