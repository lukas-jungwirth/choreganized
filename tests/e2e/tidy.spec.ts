/**
 * Tidying a saved recipe (→ plan 48, SPEC §4.5): the ••• menu's "Tidy with
 * AI" sends the recipe through the import's call and gate (the fake AI
 * provider, `scripts/fake-ai.ts`) and opens the import's review under the
 * recipe. Save updates the recipe in place: its id, and with it the plan
 * entry, its photo, tags and heart stay. Discard changes nothing.
 *
 * The recipe is made for each test, in the shared `owner` household, the way
 * a recipe imported before the rebuild looks: the note still in the name.
 */
import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';
import { DATABASE_PATH } from './accounts';

const NAME = 'Chili vom Blech';
const action = (baseURL: string) => ({ origin: baseURL, 'x-sveltekit-action': 'true' });

async function setAi(page: Page, baseURL: string, on: boolean) {
	const response = on
		? await page.request.post('/settings?/saveAiConnection', {
				form: {
					slot: 'primary',
					provider: 'gemini',
					key: 'fake-gemini-key-0123456789',
					model: 'gemini-flash-latest',
					vision: '1'
				},
				headers: action(baseURL)
			})
		: await page.request.post('/settings?/removeAiConnection', {
				form: { slot: 'primary' },
				headers: action(baseURL)
			});
	expect(response.ok()).toBe(true);
}

/** The old recipe: "Hackfleisch, gemischtes" in one name, a heart, two tags, on the plan. */
async function oldRecipe(page: Page, baseURL: string): Promise<string> {
	const form = new URLSearchParams();
	form.set('name', NAME);
	form.set('servings', '4');
	for (const line of ['500 g Hackfleisch, gemischtes', '400 g Bohnen'])
		form.append('ingredient', line);
	for (const text of [
		'Das Hackfleisch anbraten.',
		'Die Bohnen dazugeben und 20 Minuten köcheln.'
	]) {
		form.append('step', text);
		form.append('stepUses', '');
		form.append('stepTimer', '');
		form.append('stepSection', '');
	}
	form.append('tag', 'meal:dinner');
	form.append('tag', 'kind:main');
	const created = await page.request.post('/cooking/recipes/new?/save', {
		data: form.toString(),
		headers: { ...action(baseURL), 'content-type': 'application/x-www-form-urlencoded' }
	});
	expect(created.ok()).toBe(true);
	const location = String((await created.json()).location ?? '');
	const id = location.split('/').at(-1)!;
	expect(id).toMatch(/^[0-9a-f-]{36}$/);

	const hearted = await page.request.post(`/cooking/recipes/${id}?/favourite`, {
		form: { favourite: '1' },
		headers: action(baseURL)
	});
	expect(hearted.ok()).toBe(true);
	const planned = await page.request.post(`/cooking/recipes/${id}?/plan`, {
		form: { date: '2030-01-07', slot: 'dinner', recipeId: id },
		headers: action(baseURL)
	});
	expect(planned.ok()).toBe(true);
	return id;
}

async function cleanUp(page: Page, baseURL: string, id: string) {
	const db = new Database(DATABASE_PATH);
	try {
		db.prepare('delete from meals where recipe_id = ?').run(id);
	} finally {
		db.close();
	}
	const deleted = await page.request.post(`/cooking/recipes/${id}?/delete`, {
		form: {},
		headers: action(baseURL),
		maxRedirects: 0
	});
	expect(deleted.status()).toBeLessThan(400);
}

function plannedRecipe(id: string): string | null {
	const db = new Database(DATABASE_PATH, { readonly: true });
	try {
		const row = db
			.prepare("select recipe_id from meals where date = '2030-01-07' and recipe_id = ?")
			.get(id) as { recipe_id: string } | undefined;
		return row?.recipe_id ?? null;
	} finally {
		db.close();
	}
}

async function tidy(page: Page, id: string) {
	await page.goto(`/cooking/recipes/${id}`);
	await page.getByRole('button', { name: 'Recipe options' }).click();
	await page.getByRole('button', { name: /^Tidy with AI/ }).click();
	await expect(page).toHaveURL(new RegExp(`/cooking/recipes/${id}/tidy\\?draft=[a-z0-9]+$`));
	await expect(page.getByRole('heading', { name: 'Check recipe', level: 1 })).toBeVisible();
}

const ingredient = (page: Page, name: string) => page.locator('.ingredients li', { hasText: name });

test.describe('with a provider set up', () => {
	let id = '';

	test.beforeEach(async ({ page, baseURL }) => {
		await setAi(page, baseURL!, true);
		id = await oldRecipe(page, baseURL!);
	});

	test.afterEach(async ({ page, baseURL }) => {
		await cleanUp(page, baseURL!, id);
		await setAi(page, baseURL!, false);
	});

	test('tidies in two taps: the note leaves the name, and everything else stays', async ({
		page
	}) => {
		await tidy(page, id);

		// The review speaks of the saved recipe, never of a page.
		await expect(
			page.getByText('All 2 ingredients and 2 steps match the saved recipe.')
		).toBeVisible();
		await expect(page.getByText('Tidied with AI. Nothing changes until you save.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit Hackfleisch' })).toContainText(
			'gemischtes'
		);

		// A reload keeps the tidy.
		await page.reload();
		await expect(page.getByRole('button', { name: 'Edit Hackfleisch' })).toBeVisible();

		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/cooking/recipes/${id}$`));
		await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
		const hack = ingredient(page, 'Hackfleisch');
		await expect(hack).toContainText('gemischtes');
		await expect(hack).not.toContainText('Hackfleisch, gemischtes');

		// The heart, the tags and the plan entry are the recipe's still.
		await expect(page.getByRole('button', { name: 'Favourite' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByRole('link', { name: 'Show recipes tagged Dinner' })).toBeVisible();
		expect(plannedRecipe(id)).toBe(id);
	});

	test('Discard changes nothing', async ({ page }) => {
		await tidy(page, id);
		await page.getByRole('button', { name: 'Discard' }).click();
		await expect(page).toHaveURL(new RegExp(`/cooking/recipes/${id}$`));
		await expect(ingredient(page, 'Hackfleisch')).toContainText('Hackfleisch, gemischtes');
	});

	test('a tidy opens only under its own recipe', async ({ page }) => {
		await tidy(page, id);
		const draft = new URL(page.url()).searchParams.get('draft');

		// Another recipe of the household: the draft is not its tidy.
		await page.goto('/cooking/recipes');
		const other = await page
			.getByRole('link', { name: /Lentil curry/ })
			.first()
			.getAttribute('href');
		await page.goto(`${other}/tidy?draft=${draft}`);
		await expect(page.getByText('This tidy is no longer here.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

		// An id that is no recipe of this household: the server says so.
		const missing = await page.request.get(
			`/cooking/recipes/00000000-0000-4000-8000-000000000000/tidy?draft=${draft}`
		);
		expect(missing.status()).toBe(404);
	});
});

test('without a provider there is no "Tidy with AI"', async ({ page, baseURL }) => {
	const id = await oldRecipe(page, baseURL!);
	try {
		await page.goto(`/cooking/recipes/${id}`);
		await page.getByRole('button', { name: 'Recipe options' }).click();
		await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Tidy with AI/ })).toHaveCount(0);
	} finally {
		await cleanUp(page, baseURL!, id);
	}
});
