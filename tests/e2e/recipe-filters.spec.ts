/**
 * The recipe library's filters (→ plan 40, SPEC §4.3–4.5).
 *
 * Reading the filters runs on the `cookbook` household (the sketch's tagged
 * library, `--cookbook`) and changes nothing there: a filter is a URL. What
 * writes — a heart, tags typed into the form — runs on the `owner` household,
 * which the e2e journeys are allowed to change, and puts it back.
 */
import { expect, test, type Page } from '@playwright/test';
import { storageStateFor } from './accounts';

const results = (page: Page) => page.locator('ul.grid > li');

test.describe('on the cookbook', () => {
	test.use({ storageState: storageStateFor('cookbook') });

	test('a quick chip narrows the grid, and the URL keeps it', async ({ page }) => {
		await page.goto('/cooking/recipes');
		await expect(results(page)).toHaveCount(18);

		await page.getByRole('link', { name: 'Vegetarian', exact: true }).click();
		await expect(page).toHaveURL(/\?diet=vegetarian$/);
		// Pasta, curry, and the sketch's nine meat-free ones; vegan counts. The three
		// untagged recipes (→ plan 41) have no diet, so no filter finds them.
		await expect(page.getByText('11 of 18 recipes')).toBeVisible();
		await expect(results(page)).toHaveCount(11);

		await page.reload();
		await expect(results(page)).toHaveCount(11);

		// The active chip takes itself off again.
		await page.getByRole('link', { name: 'Remove Vegetarian' }).click();
		await expect(page).toHaveURL(/\/cooking\/recipes$/);
		await expect(results(page)).toHaveCount(18);
	});

	test('a time cap that is on leaves no second time chip to replace it', async ({ page }) => {
		await page.goto('/cooking/recipes?max=45');
		await expect(page.getByRole('link', { name: 'Remove Under 45 min' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Under 30 min', exact: true })).toHaveCount(0);
	});

	test('the sheet counts the hearts of the whole library, whatever the search', async ({
		page
	}) => {
		// The bruschetta has no heart; the household's six favourites still count.
		await page.goto('/cooking/recipes?q=bruschetta');
		await page.getByRole('button', { name: 'Filter', exact: true }).click();
		await expect(page.getByRole('dialog').getByText('6 recipes have a heart')).toBeVisible();
	});

	test('the sheet counts as you tap and opens what it counted', async ({ page }) => {
		await page.goto('/cooking/recipes');
		await page.getByRole('button', { name: 'Filter', exact: true }).click();
		const sheet = page.getByRole('dialog', { name: 'Filter recipes' });

		await sheet.getByRole('button', { name: 'Dinner', exact: true }).click();
		await expect(sheet.getByRole('button', { name: 'Show 8 recipes' })).toBeVisible();
		await sheet.getByRole('button', { name: 'Vegetarian', exact: true }).click();
		await expect(sheet.getByRole('button', { name: 'Show 4 recipes' })).toBeVisible();

		await sheet.getByRole('button', { name: 'Show 4 recipes' }).click();
		await expect(page).toHaveURL(/meal=dinner/);
		await expect(page).toHaveURL(/diet=vegetarian/);
		await expect(results(page)).toHaveCount(4);
		await expect(page.getByText('4 of 18 recipes')).toBeVisible();
	});

	test('nothing fits offers a way out per filter, with what it brings back', async ({ page }) => {
		await page.goto('/cooking/recipes?meal=dinner&diet=vegan&max=30');
		await expect(page.getByRole('heading', { name: 'Nothing fits all of these' })).toBeVisible();

		const way = page.getByRole('link', { name: /Without “Under 30 min”/ });
		await expect(way).toContainText('3 recipes');
		await way.click();
		await expect(page).toHaveURL(/meal=dinner&diet=vegan$/);
		await expect(results(page)).toHaveCount(3);
	});

	test('the search finds a recipe by an ingredient, and keeps the filters', async ({ page }) => {
		await page.goto('/cooking/recipes?free=gluten');
		await page.getByRole('searchbox', { name: 'Search recipes or ingredients' }).fill('lemon');
		await expect(page).toHaveURL(/q=lemon/);
		await expect(page).toHaveURL(/free=gluten/);
		// The salmon names its lemon; the Greek salad only lists one.
		await expect(results(page)).toHaveCount(2);
		await expect(page.getByRole('link', { name: /Greek salad/ })).toBeVisible();
	});

	test('a tag on a recipe opens the library filtered by it', async ({ page }) => {
		await page.goto('/cooking/recipes?kind=soup');
		await page.getByRole('link', { name: /Pumpkin soup/ }).click();
		await page.getByRole('link', { name: 'Show recipes tagged Soup' }).click();
		await expect(page).toHaveURL(/\/cooking\/recipes\?kind=soup$/);
		await expect(results(page)).toHaveCount(1);
	});

	test('not cooked lately puts the never-planned first', async ({ page }) => {
		await page.goto('/cooking/recipes?sort=stale');
		const first = await results(page).first().textContent();
		// Never on the plan up to today: banana bread, the beef goulash, Greek salad, the
		// bruschetta, the curry (planned for tomorrow, not cooked yet)… A–Z among them.
		expect(first).toContain('Banana bread');
	});
});

test.describe('on the owner household', () => {
	test('a heart on the recipe puts it under Favourites', async ({ page }) => {
		await page.goto('/cooking/recipes');
		await page.getByRole('link', { name: /Creamy mushroom pasta/ }).click();
		const heart = page.getByRole('button', { name: 'Favourite' });
		await expect(heart).toHaveAttribute('aria-pressed', 'false');

		await heart.click();
		await expect(heart).toHaveAttribute('aria-pressed', 'true');

		await page.goto('/cooking/recipes?fav=1');
		await expect(page.getByRole('link', { name: /Creamy mushroom pasta/ })).toBeVisible();

		// Put it back the way the seed left it.
		await page.getByRole('link', { name: /Creamy mushroom pasta/ }).click();
		await page.getByRole('button', { name: 'Favourite' }).click();
		await expect(page.getByRole('button', { name: 'Favourite' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	});

	test('tags set in the form are on the recipe after saving', async ({ page }) => {
		await page.goto('/cooking/recipes/new');
		await page.getByRole('textbox', { name: 'Recipe name' }).fill('Filter test soup');

		// Folded until opened: nothing set yet.
		const tags = page.locator('details.tags');
		await expect(tags).not.toHaveAttribute('open', '');
		await tags.locator('summary').click();
		await tags.getByRole('button', { name: 'Soup', exact: true }).click();
		await tags.getByRole('button', { name: 'Lunch', exact: true }).click();
		await tags.getByRole('button', { name: 'Vegan', exact: true }).click();
		await page.getByRole('button', { name: 'Save', exact: true }).click();

		await expect(page.getByRole('heading', { name: 'Filter test soup', level: 1 })).toBeVisible();
		const pills = page.getByRole('list', { name: 'Tags' });
		await expect(pills.getByRole('link')).toHaveText(['Lunch', 'Soup', 'Vegan']);

		// Opened for an edit, the block shows what is there.
		await page.goto(`${new URL(page.url()).pathname}/edit`);
		await expect(page.locator('details.tags')).toHaveAttribute('open', '');

		// Leave the household as the other journeys expect it.
		await page.goto(page.url().replace(/\/edit$/, ''));
		await page.getByRole('button', { name: 'Recipe options' }).click();
		await page.getByRole('button', { name: 'Delete recipe' }).click();
		await page.getByRole('button', { name: 'Delete recipe' }).last().click();
		await expect(page).toHaveURL(/\/cooking\/recipes$/);
	});
});

test.describe('sorting untagged recipes (→ plan 41)', () => {
	test('the cookbook offers its three untagged recipes, and the pass shows a guessed diet', async ({
		browser
	}) => {
		// Read-only on the cookbook: look, never press Next.
		const context = await browser.newContext({ storageState: storageStateFor('cookbook') });
		const page = await context.newPage();
		await page.goto('/cooking/recipes');
		await page.getByRole('link', { name: /3 recipes have no tags yet/ }).click();

		await expect(page).toHaveURL(/\/cooking\/recipes\/sort$/);
		await expect(page.getByText('0 of 3 done · stop any time')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Mushroom risotto', level: 2 })).toBeVisible();
		// Parmesan and butter: vegetarian, dotted as a guess, not yet anybody's choice.
		await expect(page.getByRole('button', { name: 'Vegetarian, suggested' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByText('Dotted: our guess from the ingredients.')).toBeVisible();

		await page.getByRole('link', { name: 'Skip', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Beef goulash', level: 2 })).toBeVisible();
		// A skip isn't done: the bar waits for a card that's actually sorted.
		await expect(page.getByText('0 of 3 done · stop any time')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Meat, suggested' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await context.close();
	});

	test('Next saves the card and moves on', async ({ page }) => {
		await page.goto('/cooking/recipes/new');
		await page.getByRole('textbox', { name: 'Recipe name' }).fill('Sorting test stew');
		await page.getByRole('textbox', { name: 'Ingredient 1' }).fill('500 g Rindfleisch');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Sorting test stew', level: 1 })).toBeVisible();
		const recipeUrl = page.url();

		// Other journeys leave untagged recipes behind; the newest card comes first.
		await page.goto('/cooking/recipes');
		await page.getByRole('link', { name: /no tags yet/ }).click();
		await expect(page.getByRole('heading', { name: 'Sorting test stew', level: 2 })).toBeVisible();
		const total = (await page.getByText(/^0 of \d+ done/).textContent())!.match(/of (\d+)/)![1];
		await page.getByRole('button', { name: 'Dinner', exact: true }).click();
		await page.getByRole('button', { name: 'Main', exact: true }).click();
		await page.getByRole('button', { name: 'Next', exact: true }).click();

		// Saved: the card moves on (or, with none left, back to the library).
		await expect(page.getByRole('heading', { name: 'Sorting test stew', level: 2 })).toHaveCount(0);
		// …and the bar counts on from where it was, even from a bare /sort address.
		if (page.url().includes('/sort')) {
			await expect(page.getByText(`1 of ${total} done · stop any time`)).toBeVisible();
		}

		await page.goto(recipeUrl);
		await expect(page.getByRole('list', { name: 'Tags' }).getByRole('link')).toHaveText([
			'Dinner',
			'Main',
			'Meat'
		]);

		await page.getByRole('button', { name: 'Recipe options' }).click();
		await page.getByRole('button', { name: 'Delete recipe' }).click();
		await page.getByRole('button', { name: 'Delete recipe' }).last().click();
		await expect(page).toHaveURL(/\/cooking\/recipes$/);
	});
});

test('the plan sheet lists the chosen meal’s recipes first (→ plan 41)', async ({ page }) => {
	await page.goto('/cooking');
	await page
		.getByRole('button', { name: /^Plan a meal on / })
		.first()
		.click();
	const sheet = page.getByRole('dialog');

	// Both seeded recipes are dinners.
	await sheet.getByRole('button', { name: 'Dinner', exact: true }).click();
	await expect(sheet.getByText('For dinner', { exact: true })).toBeVisible();

	// Nothing is tagged as a snack: the list is the plain one, unlabelled.
	await sheet.getByRole('button', { name: 'Snack', exact: true }).click();
	await expect(sheet.getByText('For a snack', { exact: true })).toHaveCount(0);

	// A quick chip narrows the list in place.
	await sheet.getByRole('button', { name: 'Favourites', exact: true }).click();
	await expect(sheet.getByRole('radio', { name: /Creamy mushroom pasta/ })).toHaveCount(0);
	await expect(sheet.getByRole('radio', { name: /Lentil curry/ })).toBeVisible();
});
