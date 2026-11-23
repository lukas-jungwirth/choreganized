/**
 * The import's review (→ plan 45, SPEC §4.7): an import opens as the recipe
 * will look, each thing the gate could not vouch for is settled where it
 * stands with one tap, and Save stores what the review showed.
 *
 * Two ways in. A pasted recipe goes through the real import and the fake AI
 * provider (`scripts/fake-ai.ts`): its one question is the either/or. A link
 * import cannot reach a page served by the test run (the fetch guard refuses
 * local addresses, and stays that way), so the drafts with a page behind them
 * are the gate's own output for the Chefkoch fixture page, saved in
 * `tests/fixtures/review-drafts/` (held to the gate by
 * `tests/integration/review-drafts.test.ts`) and put where the import page
 * puts a fresh draft: the tab's `sessionStorage`, under `?draft=<id>`.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FAKE_PANCAKE_TEXT } from '../../scripts/fake-ai';
import { ACCOUNTS, DATABASE_PATH } from './accounts';

const SAVE = { name: 'Save', exact: true } as const;

/** One saved draft, opened the way the import page opens a fresh one. */
async function openDraft(page: Page, name: string): Promise<string> {
	const id = `e2e${name.replace(/[^a-z]/g, '')}`;
	const draft = JSON.parse(readFileSync(`tests/fixtures/review-drafts/${name}.json`, 'utf8'));
	await page.goto('/cooking/recipes/import');
	await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
		key: `recipe-import:${id}`,
		value: JSON.stringify({ v: 1, draft })
	});
	await page.goto(`/cooking/recipes/import?draft=${id}`);
	await expect(page.getByRole('heading', { name: 'Check recipe', level: 1 })).toBeVisible();
	return id;
}

const stored = (page: Page, id: string) =>
	page.evaluate((key) => sessionStorage.getItem(key), `recipe-import:${id}`);

/** The question under a row or step, by the words it starts with. */
const check = (page: Page, text: string | RegExp) =>
	page.locator('[data-open-check]').filter({ hasText: text });

async function deleteRecipe(page: Page, baseURL: string) {
	const id = new URL(page.url()).pathname.split('/').at(-1);
	const deleted = await page.request.post(`/cooking/recipes/${id}?/delete`, {
		form: {},
		headers: { origin: baseURL, 'x-sveltekit-action': 'true' },
		maxRedirects: 0
	});
	expect(deleted.status()).toBeLessThan(400);
}

test.describe('a pasted recipe, through the fake AI', () => {
	test.beforeEach(async ({ page, baseURL }) => {
		const saved = await page.request.post('/settings?/saveAiConnection', {
			form: {
				slot: 'primary',
				provider: 'gemini',
				key: 'fake-gemini-key-0123456789',
				model: 'gemini-flash-latest',
				vision: '1'
			},
			headers: { origin: baseURL!, 'x-sveltekit-action': 'true' }
		});
		expect(saved.ok()).toBe(true);
	});

	test.afterEach(async ({ page, baseURL }) => {
		const removed = await page.request.post('/settings?/removeAiConnection', {
			form: { slot: 'primary' },
			headers: { origin: baseURL!, 'x-sveltekit-action': 'true' }
		});
		expect(removed.ok()).toBe(true);
	});

	async function paste(page: Page) {
		await page.goto('/cooking/recipes/import?mode=text');
		await page.getByLabel('Recipe text').fill(FAKE_PANCAKE_TEXT);
		await page.getByRole('button', { name: 'Extract recipe' }).click();
		await expect(page).toHaveURL(/\?draft=[a-z0-9]+$/);
		await expect(page.getByRole('heading', { name: 'Check recipe', level: 1 })).toBeVisible();
	}

	test('opens on the review, settles the choice, survives a reload, and saves it', async ({
		page,
		baseURL
	}) => {
		await paste(page);
		const id = new URL(page.url()).searchParams.get('draft')!;

		// The recipe as it will look: parts, notes, the linked words; one question.
		await expect(page.getByText('Gemini pancakes')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Batter', level: 3 }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: '1 thing to check' })).toBeVisible();
		await expect(page.locator('.linked', { hasText: 'flour' })).toHaveCount(1);
		await expect(page.getByText('Made with AI. Check it over before saving.')).toBeVisible();

		await check(page, 'Which do you use?').getByRole('button', { name: 'cherries' }).click();
		await expect(page.getByText('Nothing left to check')).toBeVisible();

		// A reload, or the app coming back from the background, keeps the answer.
		await page.reload();
		await expect(page.getByText('Nothing left to check')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit cherries' })).toContainText('or berries');

		await page.getByRole('button', SAVE).click();
		await expect(page.getByRole('heading', { name: 'Gemini pancakes', level: 1 })).toBeVisible();
		await expect(page.locator('.ingredients li', { hasText: 'Cherries' })).toContainText(
			'or berries'
		);
		// Saved: the draft is gone from the tab.
		expect(await stored(page, id)).toBeNull();
		await deleteRecipe(page, baseURL!);
	});

	test('Save straight away, with the question open, stores what the draft had', async ({
		page,
		baseURL
	}) => {
		await paste(page);
		await expect(page.getByRole('button', { name: '1 thing to check' })).toBeVisible();
		await page.getByRole('button', SAVE).click();

		await expect(page.getByRole('heading', { name: 'Gemini pancakes', level: 1 })).toBeVisible();
		await expect(page.locator('.ingredients li', { hasText: 'Berries' })).toContainText(
			'or cherries'
		);
		await expect(page.getByRole('heading', { name: 'Sauce' }).first()).toBeVisible();
		await deleteRecipe(page, baseURL!);
	});
});

test('the Chefkoch lasagne: the page’s amount, the other choice, a sentence put back', async ({
	page,
	baseURL
}) => {
	const id = await openDraft(page, 'lasagne');
	await expect(page.getByRole('button', { name: '2 things to check' })).toBeVisible();
	await expect(page.getByText('chefkoch.de')).toBeVisible();

	// The amount: the page says 500 g, the AI read 50 g. Keep the page's.
	const amount = check(page, 'The page says “500 g Rinderhackfleisch”');
	await expect(amount).toContainText('The AI read 50 g.');
	await amount.getByRole('button', { name: 'Keep 500 g' }).click();
	await expect(page.getByRole('button', { name: '1 thing to check' })).toBeVisible();

	// Reload mid-review: the answer stays, the other question is still open.
	await page.reload();
	await expect(page.getByRole('button', { name: '1 thing to check' })).toBeVisible();
	await expect(check(page, 'The page says “500 g')).toHaveCount(0);

	// The either/or: Gemüsebrühe, and Rotwein goes to the note.
	await check(page, 'Which do you use?').getByRole('button', { name: 'Gemüsebrühe' }).click();
	await expect(page.getByText('Nothing left to check')).toBeVisible();

	// Left out: the variations, put back after the last step, as on the page.
	await page.getByRole('button', { name: /^Left out of the steps/ }).click();
	const left = page.getByRole('listitem').filter({ hasText: 'Variationen:' });
	await left.getByRole('button', { name: 'Put back' }).click();
	await expect(page.locator('ol.steps li').last()).toContainText('Variationen:');

	await page.getByRole('button', SAVE).click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lasagne');
	const broth = page.locator('.ingredients li', { hasText: 'oder Rotwein' });
	await expect(broth).toContainText('Gemüsebrühe');
	await expect(page.locator('.ingredients li', { hasText: 'Rinderhackfleisch' })).toContainText(
		'500 g'
	);
	await expect(page.locator('.step-text').last()).toContainText('Variationen:');
	expect(await stored(page, id)).toBeNull();
	await deleteRecipe(page, baseURL!);
});

test('every kind of question is settled with one tap', async ({ page, baseURL }) => {
	await openDraft(page, 'kinds');
	await expect(page.getByRole('button', { name: '6 things to check' })).toBeVisible();

	await check(page, 'The page says “1 Zwiebel(n)”').getByRole('button', { name: 'Keep' }).click();
	await check(page, 'Also on the page: “1 Bund Thymian”')
		.getByRole('button', { name: 'Remove' })
		.click();
	await check(page, 'The page says: “Das Hackfleisch dazugeben')
		.getByRole('button', { name: 'Use the page’s text' })
		.click();
	await check(page, 'New unit: Kugeln. Add it?').getByRole('button', { name: 'Add it' }).click();
	await check(page, 'The AI read 50 g.').getByRole('button', { name: 'Use 50 g' }).click();
	await check(page, 'Which do you use?').getByRole('button', { name: 'Rotwein' }).click();

	await expect(page.getByText('Nothing left to check')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Edit Thymian/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Edit Mozzarella/ })).toContainText('2 Kugeln');

	await page.getByRole('button', SAVE).click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lasagne');
	await expect(page.locator('.ingredients li', { hasText: 'Mozzarella' })).toContainText(
		'2 Kugeln'
	);
	await expect(page.locator('.ingredients li', { hasText: 'Rinderhackfleisch' })).toContainText(
		'50 g'
	);
	await expect(page.locator('.ingredients li', { hasText: 'Thymian' })).toHaveCount(0);
	await expect(page.locator('.step-text').nth(2)).toContainText('Das Hackfleisch dazugeben');
	await deleteRecipe(page, baseURL!);

	// The word was the household's on purpose: taken out again for the journeys after this one.
	const db = new Database(DATABASE_PATH, { readonly: true });
	let units: { id: string }[];
	try {
		units = db
			.prepare(
				`select household_units.id from household_units
				 join members on members.household_id = household_units.household_id
				 join user on user.id = members.user_id
				 where user.email = ? and household_units.word = 'Kugeln'`
			)
			.all(ACCOUNTS[0].email) as { id: string }[];
	} finally {
		db.close();
	}
	expect(units).toHaveLength(1);
	for (const { id } of units) {
		const removed = await page.request.post('/settings?/removeUnit', {
			form: { id },
			headers: { origin: baseURL!, 'x-sveltekit-action': 'true' }
		});
		expect(removed.ok()).toBe(true);
	}
});

test('a page with no method and no servings: set the people, save without steps', async ({
	page,
	baseURL
}) => {
	await openDraft(page, 'no-method');
	await expect(page.getByRole('button', { name: '3 things to check' })).toBeVisible();
	await expect(page.getByText('For how many people?')).toBeVisible();
	const more = page.getByRole('button', { name: 'Increase servings' });
	for (let i = 0; i < 4; i++) await more.click();
	await check(page, 'This page has no method.')
		.getByRole('button', { name: 'Save without' })
		.click();
	await expect(page.getByRole('button', { name: '1 thing to check' })).toBeVisible();

	await page.getByRole('button', SAVE).click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lasagne');
	await expect(page.getByText('Serves 4')).toBeVisible();
	await deleteRecipe(page, baseURL!);
});

test('tapping a row edits that one row; "Edit everything" keeps the draft', async ({ page }) => {
	const id = await openDraft(page, 'clean');
	await expect(page.getByText('Nothing to check')).toBeVisible();
	await expect(page.getByText(/^All 22 ingredients and 10 steps match the page\.$/)).toBeVisible();

	await page.getByRole('button', { name: /^Edit Speck/ }).click();
	const sheet = page.getByRole('dialog');
	await sheet.getByRole('textbox', { name: 'Number' }).fill('150');
	await sheet.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByRole('button', { name: /^Edit Speck/ })).toContainText('150 g');

	// A step opens its text; its links are one tap further, in plan 46's sheet.
	await page.getByRole('button', { name: 'Edit step 2' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Link ingredients' }).click();
	await expect(page.getByRole('dialog', { name: 'Tap a word to link it' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.getByRole('button', { name: 'Edit everything' }).click();
	await expect(page).toHaveURL(new RegExp(`\\?draft=${id}&edit=1$`));
	await expect(page.getByRole('button', { name: /^150 g Speck/ })).toBeVisible();
	await page.getByRole('textbox', { name: 'Recipe name' }).fill('Lasagne vom Sonntag');

	// A reload in the editor keeps it too, and Cancel goes back to the review.
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue(
		'Lasagne vom Sonntag'
	);
	await page.getByRole('link', { name: 'Cancel' }).click();
	await expect(page.getByRole('heading', { name: 'Check recipe', level: 1 })).toBeVisible();
	await expect(page.getByText('Lasagne vom Sonntag')).toBeVisible();

	// Discard drops it: the address now finds nothing.
	await page.getByRole('button', { name: 'Discard' }).click();
	await expect(page).toHaveURL(/\/cooking\/recipes$/);
	expect(await stored(page, id)).toBeNull();
	await page.goto(`/cooking/recipes/import?draft=${id}`);
	await expect(page.getByText('This import is no longer here.')).toBeVisible();
});
