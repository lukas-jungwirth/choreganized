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
