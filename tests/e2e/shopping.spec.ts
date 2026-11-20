/**
 * Lists (→ SPEC §3.1, plan 36): add, tick, undo — the three things a hand in a
 * supermarket does — and the lists around them: a card that folds and stays
 * folded, an add field that knows which list a thing goes to, and a list you
 * can open by itself.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
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

	// Opened again, focus is on the list it is on now, which is no longer the first.
	await page.getByRole('button', { name: `Adding to ${DRUGSTORE}. Choose another list` }).focus();
	await page.keyboard.press('Enter');
	await expect(menu.getByRole('button', { name: new RegExp(DRUGSTORE) })).toBeFocused();
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
	// Who ticked it is an avatar for the eye and a name for a screen reader.
	await expect(
		page.getByRole('button', { name: /^Edit Tent pegs, ticked by Lukas/ })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit Sleeping bags', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Start over' }).click();
	await expect(page.getByText('0 of 3 done')).toBeVisible();
	// Start over leaves the screen with the press; focus goes to the first row, not nowhere.
	await expect(page.getByRole('button', { name: 'Check off Tent pegs' })).toBeFocused();
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
	const confirm = page.getByRole('dialog', { name: `Make ${name} a shopping list?` });
	// Enter in the name field (a phone keyboard's "Go") asks as the button does.
	await page.getByRole('dialog', { name: 'Edit list' }).getByLabel('Name').press('Enter');
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByText('1 of 2 done')).toBeVisible();
	await page.getByRole('button', { name: 'Save changes' }).click();
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

/** Manage lists → tap the list → Delete list, after a confirm that says what goes with it. */
async function deleteList(page: Page, name: string, says: string) {
	await page.goto('/shopping/stores');
	await page.getByRole('button', { name: `Edit ${name}` }).click();
	await page
		.getByRole('dialog', { name: 'Edit list' })
		.getByRole('button', { name: 'Delete list' })
		.click();
	const confirm = page.getByRole('dialog', { name: 'Delete list' });
	await expect(confirm).toContainText(says);
	await confirm.getByRole('button', { name: 'Delete list' }).click();
	await expect(page.getByRole('button', { name: `Edit ${name}` })).toBeHidden();
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

test('"Gurke x3" twice is one row of six, and the field says so', async ({ page }) => {
	await page.goto('/shopping');
	const name = fresh('Gurke');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(`${name} x3`);
	await field.press('Enter');
	const rows = page.getByRole('listitem').filter({ hasText: name });
	await expect(rows).toContainText('×3');

	await field.fill(`${name} x3`);
	await field.press('Enter');
	await expect(rows).toHaveCount(1);
	await expect(rows).toContainText('×6');
	await expect(page.getByTestId('quick-add-note')).toHaveText(
		`${name} was already on the list, now ×6.`
	);

	// No amount: nothing changes, and it says the thing is there already.
	await field.fill(name);
	await field.press('Enter');
	await expect(page.getByTestId('quick-add-note')).toHaveText(`${name} is already on the list.`);
	await expect(rows).toHaveCount(1);
	await expect(rows).toContainText('×6');
});

test('"Other" is the last entry in the menu, and adds there', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: `Adding to ${GROCERY}. Choose another list` }).click();
	const menu = page.getByRole('group', { name: 'Lists' });
	const other = menu.getByRole('button', { name: /^Other\b/ });
	await expect(other).toBeVisible();
	// Last of the lists, checklists included, before "New list".
	await expect(menu.getByRole('button').nth(-2)).toContainText('Other');
	await other.click();

	const field = page.getByPlaceholder('Add to Other…');
	await expect(
		page.getByRole('button', { name: 'Adding to Other. Choose another list' })
	).toBeVisible();
	const name = fresh('Kerzen');
	await field.fill(`${name} x2`);
	await field.press('Enter');
	await expect(card(page, 'Other').getByText(name)).toBeVisible();
	// Picked, so it holds for the next add, too.
	await expect(field).toBeVisible();
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

/* ── Manage lists: a list opens its sheet, and delete lives there (Lukas 2026-11-20) ── */

test('Manage lists: tap a list, change its name and icon, and both show', async ({ page }) => {
	// A list of its own, so the seeded ones stay as the other tests expect them.
	await page.goto('/shopping/stores');
	await page.getByRole('button', { name: 'Add a list' }).click();
	const name = fresh('Garden');
	await page.getByRole('dialog', { name: 'New list' }).getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create list' }).click();
	const row = page.getByRole('button', { name: `Edit ${name}` });
	await expect(row).toBeVisible();

	await row.click();
	const sheet = page.getByRole('dialog', { name: 'Edit list' });
	const renamed = fresh('Garden centre');
	await sheet.getByLabel('Name').fill(renamed);
	await sheet.getByRole('radio', { name: 'Tent' }).click();
	await sheet.getByRole('button', { name: 'Save changes' }).click();
	await expect(sheet).toBeHidden();
	const edited = page.getByRole('button', { name: `Edit ${renamed}` });
	await expect(edited).toBeVisible();
	// Focus is back on the row the sheet came from.
	await expect(edited).toBeFocused();
	await expect(edited.locator('.lucide-tent')).toBeVisible();

	// On the overview: an empty shopping list has no card, so the field's menu shows it.
	await page.goto('/shopping');
	await page.getByRole('button', { name: `Adding to ${GROCERY}. Choose another list` }).click();
	const entry = page
		.getByRole('group', { name: 'Lists' })
		.getByRole('button', { name: new RegExp(renamed) });
	await expect(entry).toBeVisible();
	await expect(entry.locator('.lucide-tent')).toBeVisible();

	await deleteList(page, renamed, 'Nothing is on it, so nothing else changes.');
});

test('delete from an opened list goes back to the overview', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'New list' }).last().click();
	const name = fresh('Party');
	await page.getByRole('dialog', { name: 'New list' }).getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create list' }).click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	const field = page.getByPlaceholder(`Add to ${name}…`);
	const item = fresh('Balloons');
	await field.fill(item);
	await field.press('Enter');
	await expect(page.getByRole('button', { name: `Check off ${item}` })).toBeVisible();

	await page.getByRole('button', { name: `Edit ${name}` }).click();
	await page
		.getByRole('dialog', { name: 'Edit list' })
		.getByRole('button', { name: 'Delete list' })
		.click();
	const confirm = page.getByRole('dialog', { name: 'Delete list' });
	await expect(confirm).toContainText('Its 1 item moves to “Other”');
	await confirm.getByRole('button', { name: 'Delete list' }).click();

	await expect(page).toHaveURL(/\/shopping$/);
	// Its item fell back to "Other", as deleting a shopping list always did.
	await expect(card(page, 'Other').getByText(item)).toBeVisible();
	// Tidy up: the item goes, so "Other" looks as the seed left it.
	await card(page, 'Other')
		.getByRole('button', { name: `Edit ${item}` })
		.click();
	await page
		.getByRole('dialog', { name: 'Edit item' })
		.getByRole('button', { name: 'Delete item' })
		.click();
	await expect(page.getByText(item)).toBeHidden();
});

/* ── Two taps, slow answers, small targets (review of 2026-11-20, DECISIONS #278) ── */

/** Posts to one form action, for holding or counting them. */
const posts = (action: string) => (url: URL) => url.search === `?/${action}`;

test('a second Enter while the first add is on its way adds nothing', async ({ page }) => {
	await page.goto('/shopping');
	let sent = 0;
	await page.route(posts('add'), async (route) => {
		sent += 1;
		await new Promise((done) => setTimeout(done, 400));
		await route.continue();
	});

	const name = fresh('Gurken');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(`${name} x3`);
	await field.press('Enter');
	await field.press('Enter');
	await page.getByRole('button', { name: 'Add item' }).click();

	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row).toContainText('×3');
	await expect(field).toHaveValue('');
	expect(sent).toBe(1);
});

test('a checklist row ticked and unticked before the first answer stays unticked', async ({
	page
}) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'New list' }).last().click();
	const list = fresh('Day trip');
	await page.getByRole('dialog', { name: 'New list' }).getByLabel('Name').fill(list);
	await page.getByRole('tab', { name: 'Checklist' }).click();
	await page.getByRole('button', { name: 'Create list' }).click();
	const name = 'Charger';
	const field = page.getByPlaceholder(`Add to ${list}…`);
	await field.fill(name);
	await field.press('Enter');
	const tick = page.getByRole('button', { name: `Check off ${name}` });
	const untick = page.getByRole('button', { name: `Put ${name} back on the list` });
	await expect(tick).toBeVisible();

	const held: Route[] = [];
	await page.route(posts('toggle'), (route) => void held.push(route));
	await tick.click();
	await untick.click();
	await expect.poll(() => held.length).toBe(2);

	// The first answer lands while the second is still out: the row must not
	// jump back to ticked in between.
	const answered = page.waitForResponse((response) => response.url().includes('__data.json'));
	await held[0].continue();
	await answered;
	await page.waitForTimeout(300);
	await expect(tick).toBeVisible();

	await held[1].continue();
	await page.unroute(posts('toggle'));
	await page.reload();
	await expect(tick).toBeVisible();
	await deleteList(page, list, 'Its 1 item is deleted with it.');
});

test('a row ticked again before Start over answers stays ticked', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'New list' }).last().click();
	const name = fresh('Bike trip');
	await page.getByRole('dialog', { name: 'New list' }).getByLabel('Name').fill(name);
	await page.getByRole('tab', { name: 'Checklist' }).click();
	await page.getByRole('button', { name: 'Create list' }).click();
	const field = page.getByPlaceholder(`Add to ${name}…`);
	await field.fill('Pump');
	await field.press('Enter');
	await page.getByRole('button', { name: 'Check off Pump' }).click();
	await expect(page.getByText('1 of 1 done')).toBeVisible();

	// The reset reaches the server, but its answer is slow; the new tick is slower still.
	let answer: (() => Promise<void>) | undefined;
	await page.route(posts('resetList'), async (route) => {
		const response = await route.fetch();
		answer = () => route.fulfill({ response });
	});
	const held: Route[] = [];
	await page.route(posts('toggle'), (route) => void held.push(route));

	await page.getByRole('button', { name: 'Start over' }).click();
	await expect.poll(() => answer).toBeDefined();
	await page.getByRole('button', { name: 'Check off Pump' }).click();
	await expect.poll(() => held.length).toBe(1);

	const answered = page.waitForResponse((response) => response.url().includes('__data.json'));
	await answer!();
	await answered;
	await page.waitForTimeout(300);
	await expect(page.getByRole('button', { name: 'Put Pump back on the list' })).toBeVisible();

	await held[0].continue();
	await page.unroute(posts('toggle'));
	await page.unroute(posts('resetList'));
	await expect(page.getByText('1 of 1 done')).toBeVisible();
	await deleteList(page, name, 'Its 1 item is deleted with it.');
});

/** Whether a point `dy` px above (negative) or below the element's box still hits it. */
function hitsAt(element: Element, dy: number) {
	const box = element.getBoundingClientRect();
	const y = dy < 0 ? box.top + dy : box.bottom + dy;
	const hit = document.elementFromPoint(box.left + box.width / 2, y);
	return hit !== null && element.contains(hit);
}

test('the amount chip and the Manage lists icon are 44px targets', async ({ page }) => {
	await page.goto('/shopping');
	const manage = page.getByRole('link', { name: 'Manage lists' });
	const box = (await manage.boundingBox())!;
	const reach = Math.ceil((44 - box.height) / 2) - 1;
	expect(await manage.evaluate(hitsAt, -reach)).toBe(true);
	expect(await manage.evaluate(hitsAt, reach)).toBe(true);

	await page.getByPlaceholder(`Add to ${GROCERY}…`).fill('Gurken x3');
	const chip = page.getByRole('button', { name: 'Read ×3 as the amount' });
	await expect(chip).toBeVisible();
	expect(await chip.evaluate(hitsAt, -5)).toBe(true);
	expect(await chip.evaluate(hitsAt, 5)).toBe(true);
});

test('a long list name leaves a suggestion its own name', async ({ page }) => {
	await page.goto('/shopping');
	await page.getByRole('button', { name: 'New list' }).last().click();
	// 40 characters, the most a list name takes.
	const name = fresh('Wholesale market on the far side').padEnd(40, 'x').slice(0, 40);
	await page.getByRole('dialog', { name: 'New list' }).getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create list' }).click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

	// Something the household has bought there before: ticked, so it is offered again.
	const thing = fresh('Zest');
	const field = page.getByPlaceholder(`Add to ${name}…`);
	await field.fill(thing);
	await field.press('Enter');
	await page.getByRole('button', { name: `Check off ${thing}` }).click();
	await expect(page.getByRole('button', { name: '1 bought' })).toBeVisible();

	await page.goto('/shopping');
	await page.getByPlaceholder(`Add to ${GROCERY}…`).fill('Zest');
	const option = page.getByRole('option', { name: new RegExp(thing) });
	await expect(option).toContainText(name);
	const item = (await option.locator('.name').boundingBox())!;
	const row = (await option.boundingBox())!;
	expect(item.width).toBeGreaterThan(row.width * 0.4);

	await deleteList(page, name, 'Its 1 item moves to');
});

test('the menu counts a row whose tick is still playing as got, like the header', async ({
	page
}) => {
	await page.goto('/shopping');
	const name = fresh('Plums');
	const field = page.getByPlaceholder(`Add to ${GROCERY}…`);
	await field.fill(name);
	await field.press('Enter');
	await expect(page.getByRole('button', { name: `Check off ${name}` })).toBeVisible();

	const icon = page.getByRole('button', { name: `Adding to ${GROCERY}. Choose another list` });
	const entry = page
		.getByRole('group', { name: 'Lists' })
		.getByRole('button', { name: new RegExp(GROCERY) })
		.locator('small');
	await icon.click();
	const before = Number(await entry.innerText());
	await page.keyboard.press('Escape');

	// The answer held back, the settle lasts as long as the test needs it.
	const held: Route[] = [];
	await page.route(posts('toggle'), (route) => void held.push(route));
	await page.getByRole('button', { name: `Check off ${name}` }).click();
	await icon.click();
	await expect(entry).toHaveText(String(before - 1));

	await held[0].continue();
	await page.unroute(posts('toggle'));
});
