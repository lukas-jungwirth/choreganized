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
	await expect(page.getByText(`goes to ${DRUGSTORE}, like last time.`)).toBeVisible();
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
