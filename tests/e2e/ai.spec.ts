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
	await page
		.getByLabel('Recipe text')
		.fill('Pancakes. 200 g flour, 2 eggs, 300 ml milk. Whisk, fry.');
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
	await page
		.getByLabel('Recipe text')
		.fill('Pancakes: flour, eggs, milk. Whisk; fry 2 minutes a side.');
	await page.getByRole('button', { name: 'Extract recipe' }).click();

	// The draft says what made it, and what it was asked.
	await expect(page.getByText(/Made with AI — check it over before saving\./)).toBeVisible();
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

	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'Gemini pancakes', level: 1 })).toBeVisible();
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('button', { name: 'Start Pancake · 2:00' })).toBeVisible();
});

test('"Improve with AI" is off until turned on, then remembered on this device', async ({
	page,
	baseURL
}) => {
	await setUpGemini(page, baseURL!);
	await page.goto('/cooking/recipes/import');

	const toggle = page.getByRole('checkbox', { name: 'Improve with AI' });
	await expect(toggle).not.toBeChecked();
	await expect(page.getByRole('button', { name: 'Add instructions for the AI' })).toHaveCount(0);

	await toggle.check();
	await expect(page.getByRole('button', { name: 'Add instructions for the AI' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('checkbox', { name: 'Improve with AI' })).toBeChecked();

	// Off again for whoever comes next on this browser profile.
	await page.getByRole('checkbox', { name: 'Improve with AI' }).uncheck();
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

test('a remembered "Improve with AI" after AI was removed just imports without it', async ({
	page,
	baseURL
}) => {
	// No connection (afterEach removed them). The toggle's `ai=1` may still be
	// remembered on the phone; the fetch must carry on, not ask for Settings.
	// A blocked address proves it got as far as fetching — no network needed.
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
