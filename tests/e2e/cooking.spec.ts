/**
 * Library → recipe → cook mode (→ SPEC §4.3, §4.5, §4.6): the deep-linkable
 * routes, stepped through the way a phone on the counter does.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { SEED } from './accounts';

test('open a recipe and step through cook mode', async ({ page }) => {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.curry) })
		.first()
		.click();
	await expect(page).toHaveURL(/\/cooking\/recipes\/[^/]+$/);
	await expect(page.getByRole('heading', { name: SEED.recipes.curry, level: 1 })).toBeVisible();

	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page).toHaveURL(/\/cook$/);
	await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByText(/^Step 2 of \d+$/)).toBeVisible();

	// Cook mode is the one dark screen whatever the theme (→ SPEC §10): the
	// browser chrome for the *light* scheme is the dark cook surface, not the
	// app's cream (`CHROME.cookBg` in src/lib/theme.ts).
	await expect(
		page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
	).toHaveAttribute('content', '#22201C');
});

test('the week shows this week and next', async ({ page }) => {
	await page.goto('/cooking');
	await expect(page.getByRole('heading', { name: 'Cooking', level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: /Browse all/ })).toBeVisible();
});

/**
 * A finger travelling across the week, as real touch input through the
 * DevTools protocol — so `touch-action`, the browser's own pan and the click
 * after a lifted finger all behave as on a phone. `dx`/`dy` are the travel
 * from the middle of `target`, or from `startX` across its middle. One CDP
 * session for the whole test: a session per gesture loses the later swipes.
 */
function finger(page: Page) {
	const session = page.context().newCDPSession(page);
	return async (target: Locator, dx: number, dy = 0, startX?: number) => {
		const cdp = await session;
		const box = (await target.boundingBox())!;
		const x = startX ?? box.x + box.width / 2;
		const y = box.y + box.height / 2;
		const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', px: number, py: number) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }]
			});
		await touch('touchStart', x, y);
		for (let step = 1; step <= 8; step++) {
			await touch('touchMove', x + (dx * step) / 8, y + (dy * step) / 8);
		}
		await touch('touchEnd', x + dx, y + dy);
	};
}

test('swiping the week sideways switches between this week and next (#84)', async ({ page }) => {
	await page.goto('/cooking');
	const weeks = page.getByRole('navigation', { name: 'Which week' });
	const current = weeks.getByRole('link', { name: /^This week/ });
	const next = weeks.getByRole('link', { name: /^Next week/ });
	await expect(current).toHaveAttribute('aria-current', 'page');
	const meals = page.locator('ul.days');
	const swipeAcross = finger(page);

	// A scroll that drifts sideways, and a swipe from the screen's edge (the
	// system's back gesture), leave the week where it is.
	await swipeAcross(meals, -90, 240);
	await swipeAcross(meals, -150, 0, 380);
	await expect(page).toHaveURL(/\/cooking$/);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// Leftwards: on to next week.
	await swipeAcross(meals, -150);
	await expect(page).toHaveURL(/\/cooking\?week=\d{4}-\d{2}-\d{2}$/);
	await expect(next).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// Leftwards again: there is no week after next to go to.
	await swipeAcross(meals, -150);
	await expect(next).toHaveAttribute('aria-current', 'page');

	// Rightwards: back to this week, on the tab's one address.
	await swipeAcross(meals, 150);
	await expect(page).toHaveURL(/\/cooking$/);
	await expect(current).toHaveAttribute('aria-current', 'page');
});

test('a step’s own timer, set in the form, is the one cook mode offers by name', async ({
	page
}) => {
	await page.goto('/cooking/recipes/new');
	await page.getByLabel('Recipe name').fill('E2E Nudeln');
	await page.getByLabel('Ingredient 1', { exact: true }).fill('200 g Nudeln');
	await page.getByLabel('Step 1', { exact: true }).fill('Die Nudeln 9 Minuten kochen.');

	// The German duration is read out of the text before anyone sets anything.
	const chip = page.getByRole('button', { name: 'Timer for step 1' });
	await expect(chip).toContainText('9:00');
	await expect(chip).toContainText('auto');

	await chip.click();
	const sheet = page.getByRole('dialog');
	await expect(sheet.getByLabel('Minutes', { exact: true })).toHaveValue('9');
	await sheet.getByLabel('Minutes', { exact: true }).fill('10');
	await sheet.getByRole('button', { name: 'Nudeln', exact: true }).click();
	await sheet.getByRole('button', { name: 'Save timer' }).click();
	await expect(chip).toContainText('Nudeln · 10:00');

	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'E2E Nudeln', level: 1 })).toBeVisible();
	await expect(page.getByText('Nudeln · 10:00')).toBeVisible();

	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page.getByRole('button', { name: 'Start Nudeln · 10:00' })).toBeVisible();

	// And taken away again, the step goes back to reading its own text.
	await page.goto(page.url().replace(/\/cook$/, '/edit'));
	await page.getByRole('button', { name: 'Timer for step 1' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove timer' }).click();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page.getByRole('button', { name: 'Start 9:00 timer' })).toBeVisible();
});

test('cooking for more people rewrites the amounts a step names, and nothing else', async ({
	page
}) => {
	await page.goto('/cooking/recipes/new');
	await page.getByLabel('Recipe name').fill('E2E Tomatensalat');
	await page.getByLabel('Servings').fill('2');
	await page.getByLabel('Ingredient 1', { exact: true }).fill('2 Tomaten');
	await page.getByRole('button', { name: 'Add ingredient' }).click();
	await page.getByLabel('Ingredient 2', { exact: true }).fill('3 EL Olivenöl');
	await page
		.getByLabel('Step 1', { exact: true })
		.fill(
			'2 Tomaten in 2 cm Würfel schneiden, mit 3 EL Olivenöl beträufeln, 10 Minuten ziehen lassen.'
		);
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'E2E Tomatensalat', level: 1 })).toBeVisible();

	// As written, nothing is marked.
	const step = page.locator('.step-text').first();
	await expect(step).toHaveText(
		'2 Tomaten in 2 cm Würfel schneiden, mit 3 EL Olivenöl beträufeln, 10 Minuten ziehen lassen.'
	);

	// For four: the two amounts double, the centimetres and the minutes don't.
	await page.goto(`${page.url()}?serves=4`);
	// (The text a screen reader gets carries what the recipe said, beside each.)
	await expect(step).toHaveText(
		'4 (recipe says 2) Tomaten in 2 cm Würfel schneiden, mit 6 EL (recipe says 3 EL) Olivenöl beträufeln, 10 Minuten ziehen lassen.'
	);
	await expect(step.locator('.scaled')).toHaveCount(2);

	// Cook mode, inheriting the count, says the same.
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page.locator('.scaled').first()).toContainText('4');
});
