/**
 * Library → recipe → cook mode (→ SPEC §4.3, §4.5, §4.6): the deep-linkable
 * routes, stepped through the way a phone on the counter does.
 */
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { ACCOUNTS, DATABASE_PATH, SEED } from './accounts';
import { finger } from './touch';

/**
 * Every timer a test started is stopped after it, passed or failed (→ DECISIONS #263).
 * The household is shared with every spec after this one, and a timer left running
 * puts its bar on every screen (over the empty space the Tasks swipe test touches)
 * and its ring in place of the step's "Start 2:00 timer" button a retry looks for.
 */
test.afterEach(async ({ page }) => {
	const db = new Database(DATABASE_PATH, { readonly: true });
	let running: { id: string }[];
	try {
		running = db
			.prepare(
				`select cook_timers.id from cook_timers join user on user.id = cook_timers.user_id
				 where user.email = ? and cook_timers.canceled_at is null`
			)
			.all(ACCOUNTS[0].email) as { id: string }[];
	} finally {
		db.close();
	}
	for (const { id } of running) {
		expect((await page.request.delete(`/api/timers/${id}`)).ok()).toBe(true);
	}
});

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
	const add = page.getByRole('textbox', { name: 'Add an ingredient' });
	await add.fill('200 g Nudeln');
	await add.press('Enter');
	await page.getByLabel('Step 1', { exact: true }).fill('Die Nudeln 9 Minuten kochen.');

	const row = page.getByRole('button', { name: 'Timer for step 1' });
	await expect(row).toContainText('Add a timer');

	// The sheet opens on the duration the text names.
	await row.click();
	const sheet = page.getByRole('dialog');
	await expect(sheet.getByLabel('Minutes', { exact: true })).toHaveValue('9');
	await sheet.getByLabel('Minutes', { exact: true }).fill('10');
	await sheet.getByRole('button', { name: 'Nudeln', exact: true }).click();
	await sheet.getByRole('button', { name: 'Save timer' }).click();
	await expect(row).toContainText('Nudeln · 10:00');

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

test('a counting word belongs to the amount, in the list and in the step', async ({ page }) => {
	// Plan 42: "2 Zehen Knoblauch" is 2 Zehen of "Knoblauch", not 2 of "Zehen Knoblauch".
	await page.goto('/cooking/recipes/new');
	await page.getByLabel('Recipe name').fill('E2E Knoblauchbrot');
	await page.getByLabel('Servings').fill('2');
	const add = page.getByRole('textbox', { name: 'Add an ingredient' });
	await add.fill('2 Zehen Knoblauch');
	await add.press('Enter');
	await add.fill('20 dag Butter');
	await add.press('Enter');
	// The row shows what the line was read as, before anything is saved.
	await expect(page.getByRole('button', { name: '2 Zehen Knoblauch, edit' })).toBeVisible();
	await expect(page.getByRole('button', { name: '200 g Butter, edit' })).toBeVisible();
	await page.getByLabel('Step 1', { exact: true }).fill('2 Zehen Knoblauch fein hacken.');
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'E2E Knoblauchbrot', level: 1 })).toBeVisible();

	const garlic = page.locator('.ingredients li', { hasText: 'Knoblauch' });
	await expect(garlic).toContainText('2 Zehen');
	await expect(page.locator('.ingredients li', { hasText: 'Butter' })).toContainText('200 g');

	// For four, the step's own amount follows, word and all.
	await page.goto(`${page.url()}?serves=4`);
	await expect(page.locator('.step-text').first()).toHaveText(
		'4 Zehen (recipe says 2 Zehen) Knoblauch fein hacken.'
	);

	// Editing shows the same row again.
	await page.goto(page.url().replace(/\?serves=4$/, '/edit'));
	await expect(page.getByRole('button', { name: '2 Zehen Knoblauch, edit' })).toBeVisible();
});

test('cooking for more people rewrites the amounts a step names, and nothing else', async ({
	page
}) => {
	await page.goto('/cooking/recipes/new');
	await page.getByLabel('Recipe name').fill('E2E Tomatensalat');
	await page.getByLabel('Servings').fill('2');
	const add = page.getByRole('textbox', { name: 'Add an ingredient' });
	await add.fill('2 Tomaten');
	await add.press('Enter');
	await add.fill('3 EL Olivenöl');
	await add.press('Enter');
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

test('the seeded lasagne reads in parts, with its notes and its stored links (plan 43)', async ({
	page
}) => {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.lasagne) })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: SEED.recipes.lasagne, level: 1 })).toBeVisible();

	// The parts head the ingredients and the steps alike.
	for (const part of ['Bolognese', 'Béchamel']) {
		await expect(page.getByRole('heading', { name: part, level: 3 })).toHaveCount(2);
	}
	// The name is what you buy; the note sits under it.
	const hack = page.locator('.ingredients li', { hasText: 'Faschiertes' });
	await expect(hack.locator('.ingredient-note')).toHaveText('gemischt');

	// A stored phrase is underlined though it isn't the ingredient's name.
	const steps = page.locator('.step-text');
	await expect(steps.nth(2).locator('.linked', { hasText: 'Zwiebelwürfel' })).toHaveCount(1);

	// Cooking for twice as many rewrites the stored amount run and nothing else.
	await page.goto(`${page.url()}?serves=8`);
	await expect(steps.nth(1)).toHaveText(
		'2 - 4 EL (recipe says 1 - 2 EL) Olivenöl in einem breiten Topf stark erhitzen. Hackfleisch hineingeben und 5 - 7 Min. krümelig anbraten.'
	);
	await expect(steps.last()).toHaveText('Im Ofen bei 180 °C etwa 40 Min. backen.');

	// The picker: one Butter row, gathered from both parts that use it.
	await page.getByRole('button', { name: 'Add to list' }).click();
	const sheet = page.getByRole('dialog');
	const butter = sheet
		.locator('li')
		.filter({ has: page.locator('.name', { hasText: /^Butter$/ }) });
	await expect(butter).toHaveCount(1);
	await expect(butter).toContainText('Béchamel · Schichten');
	await expect(butter).toContainText('80 g');
	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);

	// Cook mode: the part beside the step's number, and the same rewritten run.
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.locator('.eyebrow')).toHaveText('Step 2 of 7 · Bolognese');
	await expect(page.locator('.scaled')).toContainText('2 - 4 EL');

	// "Zwiebelwürfel" is the onion: a tap says how much of it.
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: /^Zwiebelwürfel/ }).click();
	await expect(page.locator('.bubble')).toContainText('Zwiebel');
	await expect(page.locator('.bubble .amount')).toHaveText('2');
});

test('saving the lasagne in the editor loses no note, part or link (plans 43, 46)', async ({
	page
}) => {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.lasagne) })
		.first()
		.click();
	await page.waitForURL(/\/cooking\/recipes\/[^/?]+$/);
	await page.goto(`${page.url()}/edit`);
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('heading', { name: SEED.recipes.lasagne, level: 1 })).toBeVisible();
	await expect(page).toHaveURL(/\/cooking\/recipes\/[^/?]+$/);

	await expect(page.getByRole('heading', { name: 'Béchamel', level: 3 })).toHaveCount(2);
	await expect(
		page.locator('.ingredients li', { hasText: 'Faschiertes' }).locator('.ingredient-note')
	).toHaveText('gemischt');
	await expect(
		page.locator('.step-text').nth(2).locator('.linked', { hasText: 'Zwiebelwürfel' })
	).toHaveCount(1);
	await page.goto(`${page.url()}?serves=8`);
	await expect(page.locator('.step-text').nth(1).locator('.scaled')).toContainText('2 - 4 EL');
});

/**
 * The rebuilt editor (→ plan 46): a two-part recipe typed in, a word linked by
 * tapping it, its amount linked with it, a timer, a step moved to the other
 * part, and cook mode showing all of it.
 */
test('a recipe built in the editor: parts, a tapped link, an amount that follows (plan 46)', async ({
	page
}) => {
	await page.goto('/cooking/recipes/new');
	await page.getByLabel('Recipe name').fill('E2E Gemüsetopf');
	await page.getByLabel('Servings').fill('4');
	const add = page.getByRole('textbox', { name: 'Add an ingredient' });
	await add.fill('1 Zwiebel');
	await add.press('Enter');
	await add.fill('400 g Karotten');
	await add.press('Enter');
	await page
		.getByLabel('Step 1', { exact: true })
		.fill('Zwiebelwürfel und 200 g Karotten anbraten.');
	await page.getByRole('button', { name: 'Add step' }).click();
	await page.getByLabel('Step 2', { exact: true }).fill('Butter schmelzen.');

	// Without parts the word never shows: no heading, no "Move to part…".
	await expect(page.getByRole('button', { name: /^Rename/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'More for step 2' }).click();
	await expect(page.getByRole('menuitem', { name: 'Move to part…' })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// "Add part" under the ingredients: a heading below, the rows above unchanged.
	await page.getByRole('button', { name: '+ Add part' }).first().click();
	await page.getByLabel('Name of the part').fill('Béchamel');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Béchamel', level: 3 })).toBeVisible();
	await expect(page.getByRole('button', { name: '1 Zwiebel, edit' })).toBeVisible();
	const bechamel = page.getByRole('textbox', { name: 'Add an ingredient to Béchamel' });
	await bechamel.fill('30 g Butter');
	await bechamel.press('Enter');

	// Now a step can be moved there, from its ⋯ menu.
	await page.getByRole('button', { name: 'More for step 2' }).click();
	await page.getByRole('menuitem', { name: 'Move to part…' }).click();
	await page
		.getByRole('dialog')
		.getByRole('radio', { name: /Béchamel/ })
		.click();
	await expect(page.getByRole('heading', { name: 'Béchamel', level: 3 })).toHaveCount(2);

	// Link "Zwiebelwürfel" by tapping it, and take the suggested Karotten with its amount.
	await page.getByRole('button', { name: 'Ingredients for step 1' }).click();
	const sheet = page.getByRole('dialog');
	await sheet.getByRole('button', { name: 'Zwiebelwürfel', exact: true }).click();
	await sheet
		.getByRole('group', { name: 'Link “Zwiebelwürfel” to' })
		.getByRole('button', { name: /^Zwiebel/ })
		.click();
	await expect(sheet).toContainText('“Zwiebelwürfel” → Zwiebel');
	await sheet.getByRole('button', { name: 'Link “Karotten” to Karotten?' }).first().click();
	await expect(sheet).toContainText('200 g of 400 g · follows the number of people');
	await sheet.getByRole('button', { name: '8', exact: true }).click();
	await expect(sheet).toContainText('400 g of 800 g · follows the number of people');
	await expect(sheet.locator('.words')).toContainText('400 g Karotten');
	// Tapping the amount in the text keeps it as written, and tapping it again undoes that.
	await sheet.locator('.words').getByRole('button', { name: '400 g', exact: true }).click();
	await expect(sheet).toContainText('200 g stays as written');
	await expect(sheet.locator('.words')).toContainText('200 g Karotten');
	await sheet.locator('.words').getByRole('button', { name: '200 g', exact: true }).click();
	await expect(sheet).toContainText('400 g of 800 g · follows the number of people');
	await sheet.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByRole('button', { name: 'Ingredients for step 1' })).toContainText(
		'Zwiebel, Karotten'
	);

	// A timer of its own.
	await page.getByRole('button', { name: 'Timer for step 1' }).click();
	await page.getByRole('dialog').getByLabel('Minutes', { exact: true }).fill('5');
	await page.getByRole('dialog').getByRole('button', { name: 'Save timer' }).click();
	await expect(page.getByRole('button', { name: 'Timer for step 1' })).toContainText(
		'Step 1 · 5:00'
	);

	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'E2E Gemüsetopf', level: 1 })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Béchamel', level: 3 })).toHaveCount(2);

	// Cook mode for 8: the word underlined, the amount and the share doubled.
	await page.goto(`${new URL(page.url()).pathname}/cook?serves=8`);
	await expect(page.locator('.scaled').first()).toContainText('400 g');
	await page.getByRole('button', { name: /^Zwiebelwürfel/ }).click();
	await expect(page.locator('.bubble')).toContainText('Zwiebel');
});

test('the amount is a number and a unit; your own unit is the household’s (plan 46)', async ({
	page
}) => {
	await page.goto('/cooking/recipes/new');
	await page.getByLabel('Recipe name').fill('E2E Caprese');
	const add = page.getByRole('textbox', { name: 'Add an ingredient' });
	// "Kugel" is no unit yet: the line keeps it in the name.
	await add.fill('2 Kugel Mozzarella');
	await add.press('Enter');
	await add.fill('1 Karotte, in Scheiben geschnitten');
	await add.press('Enter');
	await expect(page.getByRole('button', { name: '2 Kugel Mozzarella, edit' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: '1 Karotte in Scheiben geschnitten, edit' })
	).toBeVisible();

	await page.getByRole('button', { name: '2 Kugel Mozzarella, edit' }).click();
	const sheet = page.getByRole('dialog');
	await sheet.getByLabel(/^Name/).fill('Mozzarella');
	// Numbers only: letters are refused as they are typed.
	const number = sheet.getByLabel('Number', { exact: true });
	await number.fill('');
	await number.pressSequentially('1,5x');
	await expect(number).toHaveValue('1,5');
	await expect(sheet).toContainText('Numbers only');

	// The panel: everything visible on a 390 × 844 phone.
	await sheet.getByRole('button', { name: /^Unit:/ }).click();
	const panel = page.getByRole('dialog', { name: 'Unit' });
	for (const name of ['g', 'tbsp', 'tsp', 'cloves', 'handfuls', 'No unit', '+ Add your own']) {
		await expect(panel.getByRole('button', { name, exact: true })).toBeInViewport();
	}
	await panel.getByRole('button', { name: '+ Add your own' }).click();
	await panel.getByLabel('Your own unit').fill('Kugel');
	await panel.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(panel).toHaveCount(0);
	await expect(sheet.getByRole('button', { name: 'Unit: Kugel' })).toBeVisible();
	await sheet.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByRole('button', { name: '1½ Kugel Mozzarella, edit' })).toBeVisible();

	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: 'E2E Caprese', level: 1 })).toBeVisible();
	await expect(page.locator('.ingredients li', { hasText: 'Mozzarella' })).toContainText(
		'1½ Kugel'
	);

	// Settings lists the household's word, and takes it off the list again.
	await page.goto('/settings');
	await page.getByRole('button', { name: /^Units/ }).click();
	const units = page.getByRole('dialog', { name: 'Your own units' });
	await expect(units).toContainText('Kugel');
	await units.getByRole('button', { name: 'Remove Kugel' }).click();
	await expect(units).toContainText('None yet');
});

test('a timer counts on past zero, and is still there after the app was closed (→ DECISIONS #251)', async ({
	page
}) => {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.curry) })
		.first()
		.click();
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page).toHaveURL(/\/cook$/);

	// The sheet only offers whole minutes, and nobody wants a test that takes one.
	const recipeId = new URL(page.url()).pathname.split('/')[3];
	const started = await page.request.post('/api/timers', {
		data: { seconds: 5, label: 'Rice', recipeId, stepIndex: 0, replaces: null }
	});
	expect(started.ok()).toBe(true);
	await page.reload();

	const ring = page.getByRole('timer');
	await expect(ring).toContainText(/\b0:0\d/);
	await expect(ring).toContainText(/−0:0\d/, { timeout: 15_000 });
	await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();

	// Coming back after the alert went out: no machine in memory, and the clock
	// still knows how long ago it was.
	await page.reload();
	await expect(ring).toContainText(/−0:\d\d/);
	const before = (await ring.locator('.remaining').textContent()) ?? '';
	await expect(ring.locator('.remaining')).not.toHaveText(before, { timeout: 5000 });

	// Every other screen says the same, and stopping it there stops it for good.
	await page.goto('/cooking/recipes');
	const dock = page.getByRole('link', { name: /Rice is done/ });
	await expect(dock).toContainText(/−0:\d\d · Rice is done/);
	await page.getByRole('button', { name: 'Stop this timer' }).click();
	await expect(dock).toHaveCount(0);

	await page.reload();
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(dock).toHaveCount(0);
});

test('tapping a finished timer’s bar goes to look at it, and doesn’t stop it', async ({ page }) => {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.curry) })
		.first()
		.click();
	await page.getByRole('link', { name: 'Start cook mode' }).click();
	await expect(page).toHaveURL(/\/cook$/);

	const recipeId = new URL(page.url()).pathname.split('/')[3];
	await page.request.post('/api/timers', {
		data: { seconds: 5, label: 'Rice', recipeId, stepIndex: 1, replaces: null }
	});
	await page.reload();

	await page.getByRole('button', { name: /Rice is done/ }).click({ timeout: 15_000 });

	await expect(page.getByText(/^Step 2 of \d+$/)).toBeVisible();
	await expect(page.getByRole('timer')).toContainText(/−0:\d\d/);

	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	await expect(page.getByRole('timer')).toHaveCount(0);
});

test.describe('on an Android phone', () => {
	test.use({
		userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36'
	});

	test('starting a timer starts the track that rings a locked phone (→ DECISIONS #252)', async ({
		page
	}) => {
		await page.addInitScript(() => {
			const tracks: HTMLMediaElement[] = [];
			Object.assign(window, { tracks });
			const play = HTMLMediaElement.prototype.play;
			HTMLMediaElement.prototype.play = function () {
				tracks.push(this);
				return play.call(this);
			};
		});
		const track = () =>
			page.evaluate(() => {
				const [audio] = (window as unknown as { tracks: HTMLMediaElement[] }).tracks;
				return audio ? { paused: audio.paused, duration: audio.duration } : null;
			});

		await page.goto('/cooking/recipes');
		await page
			.getByRole('link', { name: new RegExp(SEED.recipes.curry) })
			.first()
			.click();
		await page.getByRole('link', { name: 'Start cook mode' }).click();
		await page.getByRole('button', { name: 'Start 2:00 timer' }).click();

		// Two minutes of silence, and the minute the alarm rings for. The silence is
		// measured once the ring has rendered, not at the tap (→ `AlarmTrack`), so a
		// slow first render shortens it: on a CI runner by more than half a second.
		const playing = async () => {
			const audio = await track();
			return audio && !audio.paused ? audio.duration : Number.NaN;
		};
		await expect.poll(playing).toBeGreaterThan(175);
		expect(await playing()).toBeLessThanOrEqual(180);

		const player = await page.evaluate(() => ({
			title: navigator.mediaSession.metadata?.title,
			artist: navigator.mediaSession.metadata?.artist
		}));
		expect(player.title).toBe('Step 1');
		expect(player.artist).toMatch(/^rings at /);

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(async () => (await track())?.paused).toBe(true);
		expect(await page.evaluate(() => navigator.mediaSession.metadata)).toBeNull();
	});

	test('a playing track leaves the alert to the push, even with the app on screen (→ DECISIONS #253)', async ({
		page
	}) => {
		const claims: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/rang')) claims.push(request.url());
		});

		await page.goto('/cooking/recipes');
		await page
			.getByRole('link', { name: new RegExp(SEED.recipes.curry) })
			.first()
			.click();
		await page.getByRole('link', { name: 'Start cook mode' }).click();
		await expect(page).toHaveURL(/\/cook$/);

		const recipeId = new URL(page.url()).pathname.split('/')[3];
		await page.request.post('/api/timers', {
			data: { seconds: 6, label: 'Rice', recipeId, stepIndex: 0, replaces: null }
		});
		await page.reload();

		// A timer that came back with the page gets its track from the next tap.
		await page.getByText(/^Step 1 of \d+$/).click();

		await expect(page.getByRole('timer')).toContainText(/−0:0\d/, { timeout: 15_000 });
		expect(claims).toEqual([]);

		await page.getByRole('button', { name: 'Stop', exact: true }).click();
		await expect(page.getByRole('timer')).toHaveCount(0);
	});
});
