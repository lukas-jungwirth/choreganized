/**
 * Lists (→ SPEC §3.1, plan 36): add, tick, undo — the three things a hand in a
 * supermarket does — and the lists around them: a card that folds and stays
 * folded, an add field that knows which list a thing goes to, and a list you
 * can open by itself.
 */
import { expect, test, type Page } from '@playwright/test';
import { SEED, storageStateFor } from './accounts';

const [GROCERY, DRUGSTORE, HARDWARE] = SEED.stores;

/** A name nobody has typed before, so runs and retries don't meet each other. */
const fresh = (word: string) => `${word} ${Date.now().toString(36)}`;

/** The card of one list on the overview. */
const card = (page: Page, list: string) =>
	page.locator('section.card').filter({ has: page.getByRole('button', { name: list }) });

test('add an item, tick it off, undo, tick again', async ({ page }) => {
	await page.goto('/shopping');
	await expect(page.getByText(SEED.items[0])).toBeVisible();

	const name = fresh('Pears');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(name);
	await field.press('Enter');
	await expect(page.getByText(name)).toBeVisible();

	await page.getByRole('button', { name: `Check off ${name}` }).click();
	const undo = page.getByRole('status').getByRole('button', { name: 'Undo' });
	await expect(undo).toBeVisible();
	await undo.click();
	await expect(page.getByRole('button', { name: `Check off ${name}` })).toBeVisible();

	await page.getByRole('button', { name: `Check off ${name}` }).click();
	// Settled, it waits under "{n} bought" at the foot of its own card.
	const grocery = card(page, GROCERY);
	await grocery.getByRole('button', { name: /\d+ bought/ }).click();
	await expect(page.getByRole('button', { name: `Put ${name} back on the list` })).toBeVisible();
});

test('the seeded lists with something on them are the cards', async ({ page }) => {
	await page.goto('/shopping');
	for (const store of SEED.stores) {
		await expect(page.getByRole('button', { name: new RegExp(`^${store}`) })).toBeVisible();
	}
	await expect(page.getByRole('link', { name: `Open ${GROCERY}` })).toBeVisible();
});

test('a folded card stays folded after a reload', async ({ page }) => {
	await page.goto('/shopping');
	const header = page.getByRole('button', { name: new RegExp(`^${GROCERY}`) });
	await expect(header).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByRole('button', { name: `Check off ${SEED.items[0]}` })).toBeVisible();

	await header.click();
	await expect(header).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('button', { name: `Check off ${SEED.items[0]}` })).toBeHidden();

	await page.reload();
	await expect(header).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('button', { name: `Check off ${SEED.items[0]}` })).toBeHidden();

	// Unfolded again, so the next test's page looks like the seed.
	await header.click();
	await expect(header).toHaveAttribute('aria-expanded', 'true');
});

test('a known name goes to the list it went to last time', async ({ page }) => {
	await page.goto('/shopping');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);

	// The seed sent Toothpaste to the drugstore once.
	await field.fill('Toothpaste');
	await expect(page.getByPlaceholder(`Add to ${DRUGSTORE}…`)).toBeVisible();
	await expect(page.getByText(`Goes on ${DRUGSTORE}, like last time.`)).toBeVisible();
	await page.getByPlaceholder(`Add to ${DRUGSTORE}…`).press('Enter');

	await expect(
		card(page, DRUGSTORE).getByRole('button', { name: 'Check off Toothpaste' })
	).toBeVisible();
	// Empty again, the field is back on the first list.
	await expect(page.getByPlaceholder(`Add to ${GROCERY}…`)).toBeVisible();

	// An unknown word changes nothing.
	await page.getByPlaceholder(`Add to ${GROCERY}…`).fill(fresh('Quince'));
	await expect(page.getByPlaceholder(`Add to ${GROCERY}…`)).toBeVisible();
	await expect(page.getByText('like last time')).toBeHidden();
});

test('a list picked from the menu takes two adds, and resets once the screen is left', async ({
	page
}) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: `Adding to ${GROCERY}. Choose another list` }).click();
	const menu = page.getByRole('group', { name: 'Lists' });
	await expect(menu.getByRole('button', { name: new RegExp(DRUGSTORE) })).toBeVisible();
	await menu.getByRole('button', { name: new RegExp(HARDWARE) }).click();

	const field = page.getByPlaceholder(`Add to ${HARDWARE}…`);
	const nails = fresh('Nails');
	const glue = fresh('Wood glue');
	await field.fill(nails);
	await field.press('Enter');
	await expect(card(page, HARDWARE).getByText(nails)).toBeVisible();
	await field.fill(glue);
	await field.press('Enter');
	await expect(card(page, HARDWARE).getByText(glue)).toBeVisible();
	await expect(field).toBeVisible();

	await page.goto('/home');
	await page.goto('/shopping');
	await expect(page.getByPlaceholder(`Add to ${GROCERY}…`)).toBeVisible();
});

test('"2 l milk" sets the amount in the same line', async ({ page }) => {
	await page.goto('/shopping');
	const name = fresh('milk');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(`2 l ${name}`);
	await field.press('Enter');

	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row).toContainText('2 L');
	await expect(row.getByRole('button', { name: `Check off ${name}` })).toBeVisible();
});

test('open a list, add to it alone, and go back with the browser', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('link', { name: `Open ${GROCERY}` }).click();
	await expect(page).toHaveURL(/\/shopping\/[^/]+$/);
	await expect(page.getByRole('heading', { level: 1, name: GROCERY })).toBeVisible();
	// Only this list's rows.
	await expect(page.getByText('Shampoo')).toBeHidden();

	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	const added = [fresh('Leeks'), fresh('Toothpaste paste'), fresh('Basil')];
	for (const name of added) {
		await field.fill(name);
		await field.press('Enter');
		await expect(page.getByRole('button', { name: `Check off ${name}` })).toBeVisible();
	}

	await page.goBack();
	await expect(page).toHaveURL(/\/shopping$/);
	for (const name of added) {
		await expect(
			card(page, GROCERY).getByRole('button', { name: `Check off ${name}` })
		).toBeVisible();
	}
});

test('a list from another household, or none at all, is not found', async ({ page, browser }) => {
	// The visual household's Grocery, read off its own overview.
	const other = await browser.newContext({ storageState: storageStateFor('visual') });
	const theirs = await other.newPage();
	await theirs.goto('/shopping');
	const href = await theirs.getByRole('link', { name: `Open ${GROCERY}` }).getAttribute('href');
	await other.close();
	expect(href).toMatch(/^\/shopping\/[^/]+$/);

	expect((await page.goto(href!))?.status()).toBe(404);
	expect((await page.goto('/shopping/00000000-0000-4000-8000-000000000000'))?.status()).toBe(404);
});

test('a row says nothing about who added it; its edit sheet does', async ({ page }) => {
	await page.goto('/shopping');
	const row = page.getByRole('listitem').filter({ hasText: 'Baby spinach' });
	await expect(row.getByRole('button', { name: 'Check off Baby spinach' })).toBeVisible();
	await expect(row.locator('.avatar')).toHaveCount(0);

	await row.getByRole('button', { name: 'Edit Baby spinach' }).click();
	const sheet = page.getByRole('dialog', { name: 'Edit item' });
	await expect(sheet.getByText(`Added by ${SEED.housemate}`)).toBeVisible();
});

test('the list menu works from the keyboard', async ({ page }) => {
	await page.goto('/shopping');
	const icon = page.getByRole('button', { name: `Adding to ${GROCERY}. Choose another list` });
	await icon.focus();
	await page.keyboard.press('Enter');

	// Focus goes into the menu, on the list it is on now.
	const menu = page.getByRole('group', { name: 'Lists' });
	await expect(menu.getByRole('button', { name: new RegExp(GROCERY) })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(menu.getByRole('button', { name: new RegExp(DRUGSTORE) })).toBeFocused();
	await page.keyboard.press('Enter');

	await expect(menu).toBeHidden();
	await expect(page.getByPlaceholder(`Add to ${DRUGSTORE}…`)).toBeFocused();
});

test('putting a row back while its tick is still playing leaves it open', async ({ page }) => {
	await page.goto('/shopping');
	const name = fresh('Figs');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(name);
	await field.press('Enter');
	await page.getByRole('button', { name: `Check off ${name}` }).click();

	// Inside the settle: the same name again puts the bought row back.
	await field.fill(name);
	await field.press('Enter');

	// After the beat it reads open, not stuck half-ticked, and there is one row.
	await page.waitForTimeout(2000);
	await expect(page.getByRole('button', { name: `Check off ${name}` })).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(1);
});

/* ── Checklists (plan 36 step 2) ──────────────────────────────────────────── */

test('a new checklist opens, ticks stay in place, Start over and its undo', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'New list' }).last().click();
	const sheet = page.getByRole('dialog', { name: 'New list' });
	const name = fresh('Camping');
	await sheet.getByLabel('Name').fill(name);
	await sheet.getByRole('tab', { name: 'Checklist' }).click();
	await sheet.getByRole('radio', { name: 'Tent' }).click();
	await sheet.getByRole('button', { name: 'Create list' }).click();

	// It opens, ready to fill.
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await expect(page.getByText('0 of 0 done')).toBeVisible();
	const field = page.getByPlaceholder(`Add to ${name}…`);
	for (const row of ['Tent pegs', 'Sleeping bags', 'Headlamp']) {
		await field.fill(row);
		await field.press('Enter');
		await expect(page.getByRole('button', { name: `Check off ${row}` })).toBeVisible();
	}

	// Ticks stay where they are: no settle, no undo bar, the order unchanged.
	await page.getByRole('button', { name: 'Check off Tent pegs' }).click();
	await page.getByRole('button', { name: 'Check off Headlamp' }).click();
	await expect(page.getByText('2 of 3 done')).toBeVisible();
	await expect(page.getByRole('status')).toBeHidden();
	await expect(page.getByRole('listitem')).toHaveText([/Tent pegs/, /Sleeping bags/, /Headlamp/]);
	await expect(page.getByRole('button', { name: /\d+ bought/ })).toBeHidden();

	await page.getByRole('button', { name: 'Start over' }).click();
	await expect(page.getByText('0 of 3 done')).toBeVisible();
	const undo = page.getByRole('status').getByRole('button', { name: 'Undo' });
	await expect(page.getByRole('status')).toContainText(`${name} started over`);
	await undo.click();
	await expect(page.getByText('2 of 3 done')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Put Tent pegs back on the list' })).toBeVisible();

	// The reload agrees: the undo reached the server.
	await page.reload();
	await expect(page.getByText('2 of 3 done')).toBeVisible();

	// On the overview it is one row, after the shopping lists, and opens on a tap.
	await page.goto('/shopping');
	const row = page.getByRole('link', { name: new RegExp(`^${name}`) });
	await expect(row).toContainText('2/3');
	await expect(row).toContainText('1 left · Sleeping bags');
	await row.click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

	await deleteList(page, name, 'Its 3 items are deleted with it.');
});

test('a checklist changes kind both ways, and the confirm says what moves', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'New list' }).last().click();
	const name = fresh('Errands');
	await page.getByRole('dialog', { name: 'New list' }).getByLabel('Name').fill(name);
	await page.getByRole('tab', { name: 'Checklist' }).click();
	await page.getByRole('button', { name: 'Create list' }).click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

	const field = page.getByPlaceholder(`Add to ${name}…`);
	for (const row of ['Post office', 'Bank']) {
		await field.fill(row);
		await field.press('Enter');
		await expect(page.getByRole('button', { name: `Check off ${row}` })).toBeVisible();
	}
	await page.getByRole('button', { name: 'Check off Bank' }).click();
	await expect(page.getByText('1 of 2 done')).toBeVisible();

	// Checklist → shopping list: the ticked row goes under "1 bought".
	await page.getByRole('button', { name: `Edit ${name}` }).click();
	await page.getByRole('tab', { name: 'Shopping list' }).click();
	await page.getByRole('button', { name: 'Save changes' }).click();
	const confirm = page.getByRole('dialog', { name: `Make ${name} a shopping list?` });
	await expect(confirm).toContainText('goes under “1 bought” and is cleared overnight');
	await confirm.getByRole('button', { name: 'Make it a shopping list' }).click();
	await expect(page.getByText('1 to get · 1 bought')).toBeVisible();
	await expect(page.getByRole('button', { name: '1 bought' })).toBeVisible();

	// And back: the bought row stays ticked, in place.
	await page.getByRole('button', { name: `Edit ${name}` }).click();
	await page.getByRole('tab', { name: 'Checklist' }).click();
	await page.getByRole('button', { name: 'Save changes' }).click();
	const back = page.getByRole('dialog', { name: `Make ${name} a checklist?` });
	await expect(back).toContainText('stays ticked until you start the list over');
	await back.getByRole('button', { name: 'Make it a checklist' }).click();
	await expect(page.getByText('1 of 2 done')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();

	await deleteList(page, name, 'Its 2 items are deleted with it.');
});

/** Manage lists → delete, after a confirm that says what goes with it. */
async function deleteList(page: Page, name: string, says: string) {
	await page.goto('/shopping/stores');
	await page.getByRole('button', { name: `Delete ${name}` }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete list' });
	await expect(confirm).toContainText(says);
	await confirm.getByRole('button', { name: 'Delete list' }).click();
	await expect(page.getByRole('button', { name: `Delete ${name}` })).toBeHidden();
}

/* ── The amount anywhere in the line (plan 37) ───────────────────────────── */

test('"Gurken x3" shows its amount before Enter and lands as Gurken ×3', async ({ page }) => {
	await page.goto('/shopping');
	const name = fresh('Gurken');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(`${name} x3`);
	const chip = page.getByRole('button', { name: 'Read ×3 as the amount' });
	await expect(chip).toHaveAttribute('aria-pressed', 'true');
	await field.press('Enter');

	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row).toContainText('×3');
	await expect(row.getByRole('button', { name: `Check off ${name}` })).toBeVisible();
	await expect(chip).toBeHidden();
});

test('the chip tapped off adds the line as typed, and it is never split again', async ({
	page
}) => {
	await page.goto('/shopping');
	const word = fresh('Windeln');
	const line = `${word} 4`;
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(line);
	const chip = page.getByRole('button', { name: 'Read ×4 as the amount' });
	await chip.click();
	await expect(chip).toHaveAttribute('aria-pressed', 'false');
	await field.press('Enter');
	await expect(page.getByRole('button', { name: `Check off ${line}` })).toBeVisible();

	// The same line again: the household uses it as a name now, so no chip.
	await page.getByPlaceholder(`Add to ${GROCERY}…`).fill(line);
	await expect(page.getByRole('button', { name: /as the amount$/ })).toBeHidden();
	// An amount on top of it is still read.
	await page.getByPlaceholder(`Add to ${GROCERY}…`).fill(`${line} x2`);
	await expect(page.getByRole('button', { name: 'Read ×2 as the amount' })).toBeVisible();
});

test('the chip works from the keyboard and in an opened list', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('link', { name: `Open ${GROCERY}` }).click();
	await expect(page.getByRole('heading', { level: 1, name: GROCERY })).toBeVisible();

	const name = fresh('Milch');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(`${name} 2l`);
	const chip = page.getByRole('button', { name: 'Read 2 L as the amount' });
	await expect(chip).toBeVisible();
	await chip.focus();
	await page.keyboard.press('Enter');
	await expect(chip).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('Space');
	await expect(chip).toHaveAttribute('aria-pressed', 'true');

	await field.press('Enter');
	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row).toContainText('2 L');
});

test('a card ends in one pill that carries the count and opens the list', async ({ page }) => {
	await page.goto('/shopping');
	const grocery = card(page, GROCERY);
	const pill = grocery.getByRole('link', { name: new RegExp(`^Open ${GROCERY}, \\d+ to get$`) });
	await expect(pill).toBeVisible();
	const count = Number((await pill.innerText()).trim());
	expect(count).toBeGreaterThan(0);
	await expect(grocery.getByRole('button', { name: new RegExp(`^${GROCERY}`) })).toHaveAttribute(
		'aria-expanded',
		'true'
	);
	// The count is the pill's now: the header that folds no longer says it.
	await expect(grocery.getByRole('button', { name: new RegExp(`^${GROCERY}`) })).not.toContainText(
		String(count)
	);

	await pill.click();
	await expect(page.getByRole('heading', { level: 1, name: GROCERY })).toBeVisible();
	await expect(page.getByText(new RegExp(`^${count} to get`))).toBeVisible();
});

test('"Keep here" keeps a known name on the list the field was on, and it is remembered there', async ({
	page
}) => {
	await page.goto('/shopping');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);

	// Teach a fresh name the drugstore, through the menu.
	const name = fresh('Floss');
	await page.getByRole('button', { name: `Adding to ${GROCERY}. Choose another list` }).click();
	await page
		.getByRole('group', { name: 'Lists' })
		.getByRole('button', { name: new RegExp(DRUGSTORE) })
		.click();
	await page.getByPlaceholder(`Add to ${DRUGSTORE}…`).fill(name);
	await page.getByPlaceholder(`Add to ${DRUGSTORE}…`).press('Enter');
	await expect(card(page, DRUGSTORE).getByText(name)).toBeVisible();
	// Back on the overview's own start, so no pick holds.
	await page.goto('/home');
	await page.goto('/shopping');

	// Typed again, the field moves to the drugstore and says so.
	await field.fill(name);
	await expect(page.getByText(`Goes on ${DRUGSTORE}, like last time.`)).toBeVisible();
	await page.getByRole('button', { name: `Keep on ${GROCERY}` }).click();
	await expect(page.getByText('like last time')).toBeHidden();
	await expect(page.getByPlaceholder(`Add to ${GROCERY}…`)).toBeFocused();
	await page.getByPlaceholder(`Add to ${GROCERY}…`).press('Enter');
	await expect(card(page, GROCERY).getByText(name)).toBeVisible();

	// Now the grocery is where it went last: typing it proposes nothing.
	await page.getByPlaceholder(`Add to ${GROCERY}…`).fill(name);
	await expect(page.getByPlaceholder(`Add to ${GROCERY}…`)).toBeVisible();
	await expect(page.getByText('like last time')).toBeHidden();
});
