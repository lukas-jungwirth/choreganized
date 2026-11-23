/**
 * AI features (→ SPEC §6, plan 20) against the fake providers
 * (`scripts/fake-ai.ts`, started by `scripts/e2e-server.ts`): set a provider up
 * by pasting a key, pick from the provider's own model list, add a backup, and
 * watch the backup answer when the main provider's free tier is full.
 *
 * The household is the shared e2e one, so the connections are removed again
 * afterwards — the other journeys expect AI to be off.
 */
import { expect, test, type Page } from '@playwright/test';
import { FAKE_PANCAKE_TEXT } from '../../scripts/fake-ai';

async function openAiSheet(page: Page) {
	await page.goto('/settings');
	await page.getByRole('button', { name: /^AI features/ }).click();
	return page.getByRole('dialog');
}

test.afterEach(async ({ page, baseURL }) => {
	for (const slot of ['backup', 'primary']) {
		const removed = await page.request.post('/settings?/removeAiConnection', {
			form: { slot },
			headers: { origin: baseURL!, 'x-sveltekit-action': 'true' }
		});
		expect(removed.ok()).toBe(true);
	}
});

test('a pasted key loads the provider’s own models, and the backup answers when the main one is full', async ({
	page
}) => {
	let sheet = await openAiSheet(page);
	await expect(sheet.getByText(/free tiers have limits/)).toBeVisible();

	// Main: Gemini, the default choice — paste a key and the list arrives by itself.
	await sheet.getByRole('button', { name: 'Set up' }).click();
	await expect(sheet.getByRole('button', { name: /^Google Gemini/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await sheet.getByLabel('API key').fill('fake-gemini-key-0123456789');
	const model = sheet.getByLabel('Model');
	await expect(model).toHaveValue('gemini-flash-latest');
	await expect(
		model.locator('option', { hasText: 'Gemini Flash Latest (recommended)' })
	).toHaveCount(1);

	// The free tier that is full today: the busy model.
	await model.selectOption('gemini-busy-flash');
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText('gemini-busy-flash')).toBeVisible();

	// Backup: Claude.
	await sheet.getByRole('button', { name: 'Add a backup' }).click();
	await sheet.getByRole('button', { name: /^Claude \(Anthropic\)/ }).click();
	await sheet.getByLabel('API key').fill('fake-claude-key-0123456789');
	await expect(sheet.getByLabel('Model')).toHaveValue('claude-haiku-5-5');
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText('claude-haiku-5-5')).toBeVisible();

	// The key never comes back to the page — only its hint.
	await expect(sheet.getByText('Key fake…6789').first()).toBeVisible();
	await expect(page.locator('body')).not.toContainText('fake-claude-key-0123456789');

	// The Settings row names what the house runs on.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: /^AI features/ })).toContainText(
		'Gemini · gemini-busy-flash'
	);

	// An import: Gemini answers 429, Claude answers instead — and the draft says so.
	await page.goto('/cooking/recipes/import?mode=text');
	// The fake's pancakes, word for word: the gate checks every step against the paste.
	await page.getByLabel('Recipe text').fill(FAKE_PANCAKE_TEXT);
	await page.getByRole('button', { name: 'Extract recipe' }).click();

	await expect(page.getByLabel('Recipe name')).toHaveValue('Claude pancakes');
	await expect(
		page.getByText(/Gemini couldn’t answer, so your backup \(Claude\) did/)
	).toBeVisible();
});

test('a refused key is caught before anything is saved, naming the provider', async ({ page }) => {
	const sheet = await openAiSheet(page);
	await sheet.getByRole('button', { name: 'Set up' }).click();
	await sheet.getByRole('button', { name: /^OpenRouter/ }).click();
	await sheet.getByLabel('API key').fill('sk-or-bad-key-0123456789');

	await expect(sheet.getByRole('alert')).toContainText('OpenRouter refused the key');
	await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('test connection checks the saved model for real', async ({ page }) => {
	const sheet = await openAiSheet(page);
	await sheet.getByRole('button', { name: 'Set up' }).click();
	await sheet.getByRole('button', { name: /^ChatGPT \(OpenAI\)/ }).click();
	await sheet.getByLabel('API key').fill('sk-proj-fake-0123456789');
	await expect(sheet.getByLabel('Model')).toHaveValue('gpt-5-mini');
	await sheet.getByRole('button', { name: 'Save' }).click();

	await sheet.getByRole('button', { name: 'Test connection' }).click();
	await expect(sheet.getByRole('status')).toHaveText('Connection works.');
});

test('editing reloads the saved provider’s list with the stored key, even after looking elsewhere', async ({
	page
}) => {
	const sheet = await openAiSheet(page);
	await sheet.getByRole('button', { name: 'Set up' }).click();
	await sheet.getByLabel('API key').fill('fake-gemini-key-0123456789');
	await expect(sheet.getByLabel('Model')).toHaveValue('gemini-flash-latest');
	await sheet.getByRole('button', { name: 'Save' }).click();

	await sheet.getByRole('button', { name: 'Edit' }).click();
	// The stored key, never sent back, still lists the saved provider's models…
	await expect(sheet.getByLabel('Model')).toHaveValue('gemini-flash-latest');
	await expect(sheet.getByLabel('API key')).toHaveValue('');

	// …and does again after a look at another provider, which wants its own key.
	await sheet.getByRole('button', { name: /^ChatGPT \(OpenAI\)/ }).click();
	await expect(
		sheet.getByRole('button', { name: 'Paste a key to see the models.' })
	).toBeDisabled();
	await sheet.getByRole('button', { name: /^Google Gemini/ }).click();
	await expect(sheet.getByLabel('Model')).toHaveValue('gemini-flash-latest');
});

/** The quick way in for tests that are about importing, not about Settings. */
async function setUpGemini(page: Page, baseURL: string) {
	const saved = await page.request.post('/settings?/saveAiConnection', {
		form: {
			slot: 'primary',
			provider: 'gemini',
			key: 'fake-gemini-key-0123456789',
			model: 'gemini-flash-latest',
			vision: '1'
		},
		headers: { origin: baseURL, 'x-sveltekit-action': 'true' }
	});
	expect(saved.ok()).toBe(true);
}

/** The fake provider's own port (→ scripts/e2e-server.ts `FAKE_AI_PORT`). */
const FAKE_AI = 'http://127.0.0.1:4174';

test('an AI import arrives pinned and timed, adapted as asked, and saves into cook mode', async ({
	page,
	baseURL
}) => {
	await setUpGemini(page, baseURL!);
	// A clean slate on the fake's log, so what reached the model is this test's.
	await page.request.get(`${FAKE_AI}/__reset`);

	await page.goto('/cooking/recipes/import?mode=text');
	await page.getByRole('button', { name: 'Add instructions for the AI' }).click();
	await page.getByLabel('Instructions for the AI').fill('mit Tofu statt Ei');
	await page.getByLabel('Recipe text').fill(FAKE_PANCAKE_TEXT);
	await page.getByRole('button', { name: 'Extract recipe' }).click();

	// The draft says what made it, and what it was asked.
	await expect(page.getByText(/Made with AI. Check it over before saving\./)).toBeVisible();
	await expect(page.getByText(/Adapted: “mit Tofu statt Ei”\./)).toBeVisible();

	// Step 1 arrives with its ingredients pinned (no "auto" marker), step 2 with a named timer.
	const uses = page.getByRole('button', { name: 'Ingredients for step 1' });
	await expect(uses).toContainText('flour');
	await expect(uses).not.toContainText('auto');
	await expect(page.getByRole('button', { name: 'Timer for step 2' })).toContainText(
		'Pancake · 2:00'
	);

	// The line reached the model, in the household-instructions block of the prompt.
	const log = await (await page.request.get(`${FAKE_AI}/__requests`)).json();
	expect(JSON.stringify(log.at(-1).body)).toContain('mit Tofu statt Ei');

	// The AI said what the dish is (→ plan 41): ticked and dotted, from the list only.
	await expect(page.getByRole('button', { name: 'Breakfast, suggested' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Vegetarian, suggested' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(
		page.getByText('The dotted ones are the AI’s suggestion. Tap one to change it.')
	).toBeVisible();

	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'Gemini pancakes', level: 1 })).toBeVisible();
	await expect(page.getByRole('list', { name: 'Tags' }).getByRole('link')).toHaveText([
		'Breakfast',
		'Dessert',
		'Vegetarian'
	]);
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('button', { name: 'Start Pancake · 2:00' })).toBeVisible();
});

/** AI is the import when it is set up (→ plan 44, DECISIONS #315): no switch to turn on. */
test('the link screen has no AI switch; with AI set up, the instructions are one tap away', async ({
	page,
	baseURL
}) => {
	await page.goto('/cooking/recipes/import');
	await expect(page.getByRole('button', { name: 'Fetch recipe' })).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add instructions for the AI' })).toHaveCount(0);

	await setUpGemini(page, baseURL!);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Add instructions for the AI' })).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(0);
});

/**
 * A checked import (→ plan 44), through the pasted-text mode, which needs no
 * fetch: the draft opens with its parts, a note, links and the gate's one
 * question, and Save stores all of it.
 */
test('a pasted recipe opens with parts, a note, links and what to check, and saves them', async ({
	page,
	baseURL
}) => {
	await setUpGemini(page, baseURL!);
	await page.goto('/cooking/recipes/import?mode=text');
	await page.getByLabel('Recipe text').fill(FAKE_PANCAKE_TEXT);
	await page.getByRole('button', { name: 'Extract recipe' }).click();

	// The gate's list, until plan 45's review screen: one thing to check, the choice.
	const checks = page.getByRole('region', { name: 'What the import found' });
	await expect(checks.getByRole('heading', { name: '1 thing to check' })).toBeVisible();
	await expect(checks).toContainText('Choose: berries or cherries.');

	// Step 1 arrives linked to what it names.
	await expect(page.getByRole('button', { name: 'Ingredients for step 1' })).toContainText('flour');

	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'Gemini pancakes', level: 1 })).toBeVisible();

	// The parts head their ingredients and steps; the note sits under its name.
	await expect(page.getByRole('heading', { name: 'Batter' }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Sauce' }).first()).toBeVisible();
	await expect(page.getByText('cold', { exact: true })).toBeVisible();
	await expect(page.getByText('or cherries', { exact: true })).toBeVisible();
	// The stored link underlines the step's own word.
	await expect(page.locator('main').getByText('flour').first()).toBeVisible();
});

test('standing instructions are the owner’s, and every import shows them', async ({
	page,
	baseURL
}) => {
	await setUpGemini(page, baseURL!);
	const sheet = await openAiSheet(page);
	await sheet.getByLabel('Household instructions').fill('Wir essen vegetarisch.');
	await sheet.getByRole('button', { name: 'Save instructions' }).click();
	await expect(sheet.getByRole('status')).toHaveText('Saved.');

	await page.goto('/cooking/recipes/import?mode=text');
	await expect(page.getByText('Always applied: “Wir essen vegetarisch.”')).toBeVisible();

	// Cleared again, so other journeys import without it.
	const cleared = await page.request.post('/settings?/saveAiInstructions', {
		form: { instructions: '' },
		headers: { origin: baseURL!, 'x-sveltekit-action': 'true' }
	});
	expect(cleared.ok()).toBe(true);
});

test('a link without AI set up still fetches, and an old screen’s `ai=1` changes nothing', async ({
	page,
	baseURL
}) => {
	// No connection (afterEach removed them). A screen from before plan 44 may
	// still post the old switch's `ai=1`; the fetch must carry on, not ask for
	// Settings. A blocked address proves it got as far as fetching (the guard
	// refuses it before any request), so no network is needed.
	const response = await page.request.post('/cooking/recipes/import?/fetch', {
		form: { url: 'http://127.0.0.1/rezept', ai: '1' },
		headers: { origin: baseURL!, 'x-sveltekit-action': 'true' }
	});
	const body = await response.text();
	expect(body).toContain('can’t be opened from here');
	expect(body).not.toContain('Set up AI features in Settings first');
});

test.describe('the Settings row in German (#56)', () => {
	test.beforeEach(async ({ page, baseURL }) => {
		const german = await page.request.post('/settings?/language', {
			form: { locale: 'de' },
			headers: { origin: baseURL! },
			maxRedirects: 0
		});
		expect([200, 303]).toContain(german.status());
	});

	test.afterEach(async ({ page, baseURL }) => {
		const restored = await page.request.post('/settings?/language', {
			form: { locale: 'en' },
			headers: { origin: baseURL! },
			maxRedirects: 0
		});
		expect([200, 303]).toContain(restored.status());
	});

	/** The reporter saw "KI-" / "Funktione" / "n": count the label's line boxes. */
	async function labelLines(page: Page, value: string) {
		await page.goto('/settings');
		const row = page.getByRole('button', { name: /^KI-Funktionen/ });
		await expect(row).toContainText(value);
		return row.getByText('KI-Funktionen', { exact: true }).evaluate((label) => {
			const range = document.createRange();
			range.selectNodeContents(label);
			return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
		});
	}

	test('"KI-Funktionen" stays on one line next to "Gemini · gemini-flash-latest"', async ({
		page,
		baseURL
	}) => {
		await setUpGemini(page, baseURL!);
		expect(await labelLines(page, 'Gemini · gemini-flash-latest')).toBe(1);
	});

	test('"KI-Funktionen" stays on one line next to "Nicht eingerichtet" on a 360px phone', async ({
		page
	}) => {
		await page.setViewportSize({ width: 360, height: 800 });
		expect(await labelLines(page, 'Nicht eingerichtet')).toBe(1);
	});
});

test('the sorting pass asks the AI once and dots what it suggests (→ plan 41)', async ({
	page,
	baseURL
}) => {
	await page.goto('/cooking/recipes/new');
	await page.getByRole('textbox', { name: 'Recipe name' }).fill('AI sorting test');
	await page.getByRole('textbox', { name: 'Add an ingredient' }).fill('2 Karotten');
	await page.getByRole('textbox', { name: 'Add an ingredient' }).press('Enter');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'AI sorting test', level: 1 })).toBeVisible();
	const recipeUrl = page.url();

	await setUpGemini(page, baseURL!);
	await page.goto('/cooking/recipes/sort');
	await page.getByRole('button', { name: /Let the AI suggest tags/ }).click();
	await expect(
		page.getByText('The AI suggested tags for 1 recipe. Check it as you go.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Dinner, suggested' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(
		page.getByText('The dotted ones are the AI’s suggestion. Tap one to change it.')
	).toBeVisible();

	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'AI sorting test', level: 2 })).toHaveCount(0);

	await page.goto(recipeUrl);
	await expect(page.getByRole('list', { name: 'Tags' }).getByRole('link')).toHaveText([
		'Dinner',
		'Main',
		'Vegetarian'
	]);
	await page.getByRole('button', { name: 'Recipe options' }).click();
	await page.getByRole('button', { name: 'Delete recipe' }).click();
	await page.getByRole('button', { name: 'Delete recipe' }).last().click();
	await expect(page).toHaveURL(/\/cooking\/recipes$/);
});
