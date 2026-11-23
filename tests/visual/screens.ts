/**
 * Every screen of the app, and how to reach it as the `visual` household — the
 * table both visual specs walk: `screens.spec.ts` compares each against its
 * baseline, `text-size.spec.ts` opens each at twice the text size. Each entry
 * names its `route`, which tests/conventions/visual-coverage.test.ts holds
 * against `src/routes`.
 */
import { expect, type Page } from '@playwright/test';
import { SEED } from '../e2e/accounts';
import { SEED_GUEST_TOKEN } from '../../scripts/seed-data';

export type Screen = {
	name: string;
	/** The SvelteKit route id it shows — tests/conventions/visual-coverage.test.ts reads it. */
	route: string;
	/** Where to go — or how to get there, when a URL alone won't do. */
	path: string;
	navigate?: (page: Page) => Promise<void>;
	theme?: 'dark';
	signedOut?: boolean;
	/** CSS selectors painted over before comparing; each must match something. */
	mask?: string[];
	/** The whole document (only for screens without the fixed tab bar). */
	fullPage?: boolean;
	/** Also capture the screen scrolled to the bottom, as `<name>-bottom`. */
	bottom?: boolean;
	/**
	 * Another seeded household than `visual` (→ tests/e2e/accounts.ts): `guests`
	 * spent the sketch's weekend with Jonas (→ plan 38); `fullhouse` has a member
	 * per colour, eight; `cookbook` has the recipe-filters sketch's tagged
	 * library (→ plan 40). All unmutated, like `visual`.
	 */
	account?: 'guests' | 'fullhouse' | 'cookbook';
};

export async function openRecipe(page: Page): Promise<void> {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.curry) })
		.first()
		.click();
	// The library has an h1 too, so the heading alone can resolve before the
	// click has navigated — wait for the recipe's own address first. (The
	// editor shot appended `/edit` to the library's URL once, and screenshotted
	// a 404.)
	await page.waitForURL(/\/cooking\/recipes\/(?!new$|import)[^/?]+(?:\?.*)?$/);
	await page.getByRole('heading', { level: 1 }).waitFor();
}

/** The lasagne in the editor (→ plan 46), scrolled so `heading` is at the top. */
export async function openLasagneEditor(
	page: Page,
	nameField: string,
	heading?: string
): Promise<void> {
	await openLasagne(page);
	await page.goto(`${new URL(page.url()).pathname}/edit`);
	await page.getByRole('textbox', { name: nameField }).waitFor();
	if (heading) {
		await page.evaluate((name) => {
			const found = [...document.querySelectorAll('h2, h3')].find(
				(el) => el.textContent?.trim().toLowerCase() === name.toLowerCase()
			);
			window.scrollTo(0, (found?.getBoundingClientRect().top ?? 0) + window.scrollY - 12);
		}, heading);
	}
}

/** The words the editor's shots find things by, in each language the walk uses. */
export const EDITOR_WORDS = {
	en: {
		name: 'Recipe name',
		ingredients: 'Ingredients',
		steps: 'Steps',
		more: (step: number) => `More for step ${step}`,
		unit: /^Unit:/,
		unitTitle: 'Unit',
		part: 'Part',
		toPart: 'Move to part…',
		moveTitle: 'Move to part',
		links: (step: number) => `Ingredients for step ${step}`,
		linksTitle: 'Tap a word to link it'
	},
	de: {
		name: 'Rezeptname',
		ingredients: 'Zutaten',
		steps: 'Schritte',
		more: (step: number) => `Mehr zu Schritt ${step}`,
		unit: /^Einheit:/,
		unitTitle: 'Einheit',
		part: 'Teil',
		toPart: 'In anderen Teil…',
		moveTitle: 'In anderen Teil',
		links: (step: number) => `Zutaten für Schritt ${step}`,
		linksTitle: 'Tipp auf ein Wort, um es zu verknüpfen'
	}
};

/**
 * The editor's screens and sheets (→ plan 46). Each opens the lasagne's editor
 * and gets to its frame by the words of `words`; `text-size.spec.ts` walks the
 * German twins by their German names.
 */
export function editorShots(
	words: (typeof EDITOR_WORDS)['en']
): { name: string; navigate: (page: Page) => Promise<void> }[] {
	const open = (page: Page, heading: string) => openLasagneEditor(page, words.name, heading);
	const ingredient = async (page: Page) => {
		await open(page, words.ingredients);
		await page.getByRole('button', { name: /^500 g Faschiertes/ }).click();
		await page.getByRole('dialog').getByText(words.part, { exact: true }).waitFor();
	};
	return [
		{ name: 'recipe-edit-part', navigate: (page) => open(page, words.ingredients) },
		{
			name: 'recipe-edit-step',
			navigate: async (page) => {
				await open(page, words.steps);
				await page.getByRole('button', { name: words.more(1) }).click();
			}
		},
		{ name: 'recipe-edit-ingredient', navigate: ingredient },
		{
			name: 'recipe-edit-unit',
			navigate: async (page) => {
				await ingredient(page);
				await page.getByRole('button', { name: words.unit }).click();
				await page.getByRole('dialog', { name: words.unitTitle, exact: true }).waitFor();
				await page.waitForTimeout(300);
			}
		},
		{
			name: 'recipe-edit-move',
			navigate: async (page) => {
				await open(page, words.steps);
				await page.getByRole('button', { name: words.more(3) }).click();
				await page.getByRole('menuitem', { name: words.toPart }).click();
				await page.getByRole('dialog', { name: words.moveTitle }).waitFor();
				await page.waitForTimeout(300);
			}
		},
		{
			name: 'recipe-edit-links',
			navigate: async (page) => {
				await open(page, words.steps);
				await page.getByRole('button', { name: words.links(2) }).click();
				await page.getByRole('dialog', { name: words.linksTitle }).waitFor();
				await page.getByRole('button', { name: '8', exact: true }).click();
				await page.waitForTimeout(300);
			}
		}
	];
}

/** The seeded lasagne (→ plan 43): parts, notes, steps linked by their words. */
export async function openLasagne(page: Page): Promise<void> {
	await page.goto('/cooking/recipes');
	await page
		.getByRole('link', { name: new RegExp(SEED.recipes.lasagne) })
		.first()
		.click();
	await page.waitForURL(/\/cooking\/recipes\/(?!new$|import)[^/?]+(?:\?.*)?$/);
	await page.getByRole('heading', { level: 1, name: SEED.recipes.lasagne }).waitFor();
}

/** The cookbook's pumpkin soup (→ plan 40): lunch, dinner, soup, vegan, a heart. */
export async function openPumpkinSoup(page: Page): Promise<void> {
	await page.goto('/cooking/recipes?kind=soup');
	await page.getByRole('link', { name: /Pumpkin soup/ }).click();
	await page.waitForURL(/\/cooking\/recipes\/(?!new$|import)[^/?]+(?:\?.*)?$/);
	await page.getByRole('heading', { level: 1, name: 'Pumpkin soup' }).waitFor();
}

/** The first list, opened from its card's corner button (plan 36 [L5]). */
export async function openGrocery(page: Page): Promise<void> {
	await page.goto('/shopping');
	await page.getByRole('link', { name: `Open ${SEED.stores[0]}` }).click();
	await page.waitForURL(/\/shopping\/(?!stores$)[^/]+$/);
	await page.getByRole('heading', { level: 1, name: SEED.stores[0] }).waitFor();
}

/** "Gurken x3" typed into the add field, not yet added: the amount chip shows ×3. */
export async function typeAmount(page: Page): Promise<void> {
	await page.goto('/shopping');
	await page.getByPlaceholder(/^Add to /).fill('Gurken x3');
	await page.getByRole('button', { name: 'Read ×3 as the amount' }).waitFor();
}

/** The seeded checklist, opened from its row on the overview (plan 36 [L4]). */
export async function openChecklist(page: Page): Promise<void> {
	await page.goto('/shopping');
	await page.getByRole('link', { name: new RegExp(`^${SEED.checklist}`) }).click();
	await page.waitForURL(/\/shopping\/(?!stores$)[^/]+$/);
	await page.getByRole('heading', { level: 1, name: SEED.checklist }).waitFor();
}

/**
 * A brand-new sign-up with no household, for the onboarding screens — the only
 * way to reach them, since both seeded accounts own one. A new account per test
 * (→ tests/e2e/onboarding.spec.ts), so nothing here touches the `visual`
 * household. The name is fixed: "Welcome, Fresh" is on the screen.
 */
export async function freshAccount(page: Page): Promise<void> {
	await page.context().clearCookies();
	const email = `visual-fresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
	const signUp = await page.request.post('/api/auth/sign-up/email', {
		data: { name: 'Fresh Person', email, password: 'e2e-password-fresh' }
	});
	expect(signUp.ok()).toBe(true);
}

/**
 * Home the first time a raccoon is met (→ plan 35): a new household of its
 * own, because the `visual` one has met today's raccoon already (setup.ts).
 * A new member's first look is always the welcome raccoon (→ DECISIONS #238),
 * so the shot is the same every run.
 */
export async function newRaccoonCard(page: Page): Promise<void> {
	await freshAccount(page);
	await page.goto('/onboarding/create');
	await page.getByLabel('Household name').fill('Waschbärweg 1');
	await page.getByLabel('Your display name').fill('Fresh');
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForURL(/\/onboarding\/invite$/);
	await page.goto('/home');
	await page.getByRole('link', { name: /New raccoon!/ }).waitFor();
}

/** [9b] with an amount and a description typed, as it looks just before Save. */
export async function openAddExpense(page: Page): Promise<void> {
	await page.goto('/expenses');
	await page.getByRole('button', { name: 'Add expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	await sheet.getByLabel('Amount').fill('42.10');
	await sheet.getByLabel('What for?').fill('Weekly shop · Billa');
	await sheet.getByLabel('What for?').blur();
}

export async function openAiFeatures(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByRole('button', { name: /^AI features/ }).click();
	await page
		.getByRole('dialog')
		.getByText(/free tiers have limits/)
		.waitFor();
}

/**
 * Admin mode on for the `visual` account (→ plan 34): seven taps on the
 * version, as a person would. The e2e server lists it in `ADMIN_EMAILS`.
 */
async function enterAdmin(page: Page): Promise<void> {
	await page.goto('/settings');
	const version = page.getByRole('button', { name: /^Version/ });
	for (let tap = 0; tap < 7; tap += 1) await version.click();
	await page.getByRole('link', { name: 'Admin' }).waitFor();
}

/**
 * The admin page with one household row: how many there are depends on which
 * specs ran first (each fresh sign-up adds one), and a longer list's mask is
 * painted over the tab bar. The rest stay out of the picture, not just masked.
 */
async function openAdmin(page: Page): Promise<void> {
	await enterAdmin(page);
	await page.goto('/admin');
	await page.locator('.household').first().waitFor();
	await page.evaluate(() =>
		document.querySelectorAll('.household').forEach((row, index) => index > 0 && row.remove())
	);
}

export const SCREENS: Screen[] = [
	{ name: 'login', route: '/login', path: '/login', signedOut: true, fullPage: true },
	// The legal pages (→ SPEC §13), with the e2e server's made-up text: the long
	// one signed out, as sign-in opens it, and the short one dark, from Settings.
	{
		name: 'legal-privacy',
		route: '/legal/[page=legal]',
		path: '/legal/privacy?from=login',
		signedOut: true,
		fullPage: true
	},
	{
		name: 'legal-imprint-dark',
		route: '/legal/[page=legal]',
		path: '/legal/imprint?from=settings',
		theme: 'dark',
		fullPage: true
	},
	{ name: 'kit-light', route: '/dev/kit', path: '/dev/kit', fullPage: true },
	{ name: 'kit-dark', route: '/dev/kit', path: '/dev/kit', theme: 'dark', fullPage: true },
	{ name: 'home', route: '/(app)/home', path: '/home', bottom: true },
	{ name: 'home-dark', route: '/(app)/home', path: '/home', theme: 'dark' },
	{ name: 'shopping', route: '/(app)/shopping', path: '/shopping', bottom: true },
	{ name: 'shopping-dark', route: '/(app)/shopping', path: '/shopping', theme: 'dark' },
	// The add field's list menu [L2] (plan 36).
	{
		name: 'shopping-menu',
		route: '/(app)/shopping',
		path: '',
		navigate: async (page) => {
			await page.goto('/shopping');
			await page.getByRole('button', { name: /Choose another list$/ }).click();
			await page.getByRole('group', { name: 'Lists' }).waitFor();
		}
	},
	// A list opened by itself [L5], in both themes: the struck rows under
	// "{n} bought" start unfolded here.
	{ name: 'shopping-list', route: '/(app)/shopping/[listId]', path: '', navigate: openGrocery },
	{
		name: 'shopping-list-dark',
		route: '/(app)/shopping/[listId]',
		path: '',
		navigate: openGrocery,
		theme: 'dark'
	},
	// A checklist opened [L4] (plan 36 step 2), in both themes: ticks in place
	// with the ticker's avatar, the progress bar, Start over at the foot.
	{
		name: 'shopping-checklist',
		route: '/(app)/shopping/[listId]',
		path: '',
		navigate: openChecklist
	},
	{
		name: 'shopping-checklist-dark',
		route: '/(app)/shopping/[listId]',
		path: '',
		navigate: openChecklist,
		theme: 'dark'
	},
	// New list [L6]: a name, the "Shopping list | Checklist" switch, the icons.
	{
		name: 'shopping-new-list',
		route: '/(app)/shopping',
		path: '',
		navigate: async (page) => {
			await page.goto('/shopping');
			await page.getByRole('button', { name: 'New list' }).last().click();
			await page
				.getByRole('dialog', { name: 'New list' })
				.getByRole('tab', { name: 'Checklist' })
				.click();
		}
	},
	// A known name moved the field to another list: the line says where, and
	// "Keep here" puts it back (Lukas 2026-11-20).
	{
		name: 'shopping-remembered',
		route: '/(app)/shopping',
		path: '',
		navigate: async (page) => {
			await page.goto('/shopping');
			await page.getByPlaceholder(/^Add to /).fill('Toothpaste');
			await page.getByRole('button', { name: /^Keep on / }).waitFor();
		}
	},
	// The add field reading an amount at the end of the line (plan 37): the chip.
	{ name: 'shopping-amount', route: '/(app)/shopping', path: '', navigate: typeAmount },
	{
		name: 'shopping-amount-dark',
		route: '/(app)/shopping',
		path: '',
		navigate: typeAmount,
		theme: 'dark'
	},
	{ name: 'tasks', route: '/(app)/tasks', path: '/tasks', bottom: true },
	// The calendar screens, which the real clock kept out of here until the
	// fixed one (→ DECISIONS #184).
	{ name: 'tasks-history', route: '/(app)/tasks/history', path: '/tasks/history' },
	{ name: 'tasks-history-all', route: '/(app)/tasks/history/all', path: '/tasks/history/all' },
	{ name: 'week', route: '/(app)/cooking', path: '/cooking', bottom: true },
	{ name: 'expenses-history', route: '/(app)/expenses/history', path: '/expenses/history' },
	// The Category sheet: checkboxes, each wearing its rows' icon in the list —
	// the arrows on Payments included (→ DECISIONS #193).
	{
		name: 'expenses-history-category',
		route: '/(app)/expenses/history',
		path: '',
		navigate: async (page) => {
			await page.goto('/expenses/history?category=payments');
			await page.getByRole('button', { name: 'Payments', exact: true }).click();
			await page.getByRole('dialog', { name: 'Category' }).waitFor();
		}
	},
	{ name: 'recipes', route: '/(app)/cooking/recipes', path: '/cooking/recipes' },
	{
		name: 'recipe',
		route: '/(app)/cooking/recipes/[id]',
		path: '',
		navigate: openRecipe,
		bottom: true
	},
	// The editor [3c]: each step's ingredient chips and, under them, its timer
	// chip — "auto" where the text names a duration (→ plan 21).
	{
		name: 'recipe-edit',
		route: '/(app)/cooking/recipes/[id]/edit',
		path: '',
		navigate: async (page) => {
			await openRecipe(page);
			await page.goto(`${new URL(page.url()).pathname}/edit`);
			await page.getByRole('textbox', { name: 'Recipe name' }).waitFor();
		},
		bottom: true
	},
	// The rebuilt editor (→ plan 46) on the lasagne: an open part [E1], a step
	// card with its two rows [E3a], the ingredient sheet [E2], the unit panel
	// [E2b], Move to part [E3b] and the link sheet [E3]; light and dark.
	...editorShots(EDITOR_WORDS.en).flatMap((shot) =>
		(['light', 'dark'] as const).map((theme) => ({
			name: theme === 'dark' ? `${shot.name}-dark` : shot.name,
			route: '/(app)/cooking/recipes/[id]/edit',
			path: '',
			navigate: shot.navigate,
			...(theme === 'dark' ? { theme } : {})
		}))
	),
	{
		name: 'cook-mode',
		route: '/(app)/cooking/recipes/[id]/cook',
		path: '',
		navigate: async (page) => {
			await openRecipe(page);
			await page.getByRole('link', { name: 'Start cook mode' }).click();
			await page.getByText(/^Step 1 of/).waitFor();
		}
	},
	// A recipe in parts (→ plan 43): part headings over the ingredients and the
	// steps, notes under names, linked words underlined; and in cook mode the
	// part beside the step's number, cooking for twice as many.
	{
		name: 'recipe-parts',
		route: '/(app)/cooking/recipes/[id]',
		path: '',
		navigate: openLasagne,
		bottom: true
	},
	{
		name: 'cook-mode-part',
		route: '/(app)/cooking/recipes/[id]/cook',
		path: '',
		navigate: async (page) => {
			await openLasagne(page);
			await page.goto(`${new URL(page.url()).pathname}/cook?serves=8&step=2`);
			await page.getByText(/^Step 2 of/).waitFor();
		}
	},
	{ name: 'expenses', route: '/(app)/expenses', path: '/expenses', bottom: true },
	{ name: 'expenses-dark', route: '/(app)/expenses', path: '/expenses', theme: 'dark' },
	{ name: 'expenses-add', route: '/(app)/expenses', path: '', navigate: openAddExpense },
	{
		name: 'expenses-split',
		route: '/(app)/expenses',
		path: '',
		navigate: async (page) => {
			await openAddExpense(page);
			await page.getByRole('button', { name: /^Split/ }).click();
			const split = page.getByRole('dialog', { name: 'Split' });
			await split.getByRole('tab', { name: 'Amounts', exact: true }).click();
			await split.getByRole('textbox').first().fill('20');
		}
	},
	{
		name: 'expenses-settle',
		route: '/(app)/expenses',
		path: '/expenses',
		navigate: async (page) => {
			await page.goto('/expenses');
			// The seed has Elisabeth owing the reader: one payment, Mark as paid [10a].
			await page.getByRole('button', { name: /^Mark as paid/ }).click();
			await page.getByRole('dialog', { name: 'Settle up' }).waitFor();
		}
	},
	{
		name: 'expense-detail',
		route: '/(app)/expenses/[id]',
		path: '',
		navigate: async (page) => {
			await page.goto('/expenses');
			await page.getByRole('link', { name: /Strom · Wien Energie/ }).click();
			await page.getByRole('heading', { name: 'Strom · Wien Energie' }).waitFor();
		},
		// "Added … at 14:00": the minute the seed ran, which is however long
		// the server took to start after the run's clock began.
		mask: ['.stamps']
	},
	// Recurring [9h] and one series [9h-stop]: the seed's monthly Strom.
	{
		name: 'expenses-recurring',
		route: '/(app)/expenses/recurring',
		path: '/expenses/recurring'
	},
	{
		name: 'expenses-series',
		route: '/(app)/expenses/recurring',
		path: '',
		navigate: async (page) => {
			await page.goto('/expenses/recurring');
			await page.getByTestId('series-row').first().click();
			await page.getByRole('dialog', { name: 'Strom · Wien Energie' }).waitFor();
		}
	},
	// Guests [G1] [G3] [G5] (→ plan 38), in the household that spent the weekend with Jonas.
	{
		name: 'expenses-guest-split',
		route: '/(app)/expenses/[id]',
		path: '',
		account: 'guests',
		navigate: async (page) => {
			await page.goto('/expenses');
			await page.getByRole('link', { name: /Dinner in Bozen/ }).click();
			await page.getByRole('button', { name: 'Edit' }).click();
			await page.getByRole('dialog', { name: 'Edit expense' }).waitFor();
			await page.getByRole('button', { name: /^Split/ }).click();
			await page.getByRole('dialog', { name: 'Split' }).waitFor();
		}
	},
	{ name: 'expenses-guests', route: '/(app)/expenses', path: '/expenses', account: 'guests' },
	{
		name: 'expenses-guests-dark',
		route: '/(app)/expenses',
		path: '/expenses',
		account: 'guests',
		theme: 'dark'
	},
	// The task sheet with "Keep to the schedule" on: a monthly chore's two days and
	// what's coming up (→ SPEC §5.2, plan 39).
	{
		name: 'tasks-schedule-sheet',
		route: '/(app)/tasks',
		path: '',
		navigate: async (page) => {
			await page.goto('/tasks');
			await page.getByRole('button', { name: 'Open Clean the fridge' }).click();
			await page.getByRole('button', { name: 'Edit task' }).click();
			const sheet = page.getByRole('dialog', { name: 'Edit task' });
			await sheet.getByText(/^Coming up: /).scrollIntoViewIfNeeded();
		}
	},
	{
		name: 'expenses-guest-sheet',
		route: '/(app)/expenses',
		path: '',
		account: 'guests',
		navigate: async (page) => {
			await page.goto('/expenses');
			await page.getByRole('button', { name: 'Jonas, guest: open their page' }).click();
			await page.getByRole('dialog', { name: 'Jonas' }).waitFor();
		}
	},
	{
		name: 'expenses-guest-settings',
		route: '/(app)/expenses',
		path: '',
		account: 'guests',
		navigate: async (page) => {
			await page.goto('/expenses');
			await page.getByRole('button', { name: 'More' }).click();
			await page.getByRole('menuitem', { name: 'Expense settings' }).click();
			await page.getByRole('dialog', { name: 'Expenses' }).getByText('Guests').waitFor();
		}
	},
	// Jonas's own page [G6], opened from his link with no session, and a dead link [G8].
	{
		name: 'guest-page',
		route: '/g/[token]',
		path: `/g/${SEED_GUEST_TOKEN}`,
		signedOut: true,
		fullPage: true
	},
	{
		name: 'guest-page-dark',
		route: '/g/[token]',
		path: `/g/${SEED_GUEST_TOKEN}`,
		signedOut: true,
		theme: 'dark'
	},
	{
		name: 'guest-page-gone',
		route: '/g/[token]',
		path: `/g/${'0'.repeat(43)}`,
		signedOut: true
	},
	{ name: 'settings', route: '/(app)/settings', path: '/settings', bottom: true },
	{
		name: 'raccoon-album',
		route: '/(app)/settings/raccoons',
		path: '/settings/raccoons',
		bottom: true
	},
	{
		name: 'raccoon-album-dark',
		route: '/(app)/settings/raccoons',
		path: '/settings/raccoons',
		theme: 'dark'
	},
	{
		name: 'raccoon-card',
		route: '/(app)/settings/raccoons',
		path: '',
		navigate: async (page) => {
			await page.goto('/settings/raccoons?card=tea');
			await page.getByRole('dialog', { name: 'Raccoon album' }).getByText('Seen 5×').waitFor();
		}
	},
	{
		name: 'raccoon-card-locked',
		route: '/(app)/settings/raccoons',
		path: '',
		navigate: async (page) => {
			await page.goto('/settings/raccoons?card=skiing');
			await page.getByRole('dialog', { name: 'Raccoon album' }).getByText('Not met yet').waitFor();
		}
	},
	{ name: 'home-new-raccoon', route: '/(app)/home', path: '', navigate: newRaccoonCard },
	// Every count on the page depends on which other specs ran first, so the
	// numbers and the one row left (→ `openAdmin`) are masked; what's guarded
	// is the layout around them.
	{
		name: 'admin',
		route: '/(app)/admin',
		path: '',
		navigate: openAdmin,
		mask: ['.tiles .value', '.bars', '.household']
	},
	{
		name: 'admin-dark',
		route: '/(app)/admin',
		path: '',
		navigate: openAdmin,
		theme: 'dark',
		mask: ['.tiles .value', '.bars', '.household']
	},
	{
		name: 'home-raccoon-picker',
		route: '/(app)/home',
		path: '',
		navigate: async (page) => {
			await enterAdmin(page);
			await page.goto('/home');
			await page.getByRole('button', { name: 'Pick a raccoon' }).click();
			await page.getByRole('dialog', { name: 'Pick a raccoon' }).waitFor();
		}
	},
	{
		name: 'settings-dark',
		route: '/(app)/settings',
		path: '/settings',
		theme: 'dark',
		bottom: true
	},
	// A member per colour (`--full-house`): every place that lists the whole
	// household, at its widest — the standings strip's "+4", the leaderboard,
	// the roster, and the colour picker with seven of eight taken.
	{
		name: 'home-full-house',
		route: '/(app)/home',
		path: '/home',
		account: 'fullhouse',
		bottom: true
	},
	{
		name: 'tasks-history-full-house',
		route: '/(app)/tasks/history',
		path: '/tasks/history',
		account: 'fullhouse',
		fullPage: true
	},
	{
		name: 'members-full-house',
		route: '/(app)/settings/members',
		path: '/settings/members',
		account: 'fullhouse',
		mask: ['.invite .pending']
	},
	{
		name: 'profile-full-house',
		route: '/(app)/settings',
		path: '',
		account: 'fullhouse',
		navigate: async (page) => {
			await page.goto('/settings');
			await page.getByRole('button', { name: 'Edit' }).first().click();
			await page.getByRole('dialog').getByRole('radiogroup').waitFor();
		}
	},
	// The AI features sheet as a household first meets it: nothing set up yet,
	// the free-tier note above the two slots (→ plan 20).
	{ name: 'settings-ai', route: '/(app)/settings', path: '', navigate: openAiFeatures },
	{
		name: 'settings-ai-dark',
		route: '/(app)/settings',
		path: '',
		navigate: openAiFeatures,
		theme: 'dark'
	},
	// Setting up the main provider, the fake Gemini's model list loaded by the
	// pasted key. Nothing is saved, so the household stays as seeded.
	{
		name: 'settings-ai-setup',
		route: '/(app)/settings',
		path: '',
		navigate: async (page) => {
			await openAiFeatures(page);
			const sheet = page.getByRole('dialog');
			await sheet.getByRole('button', { name: 'Set up' }).click();
			await sheet.getByLabel('API key').fill('fake-gemini-key-0123456789');
			await expect(sheet.getByLabel('Model')).toHaveValue('gemini-flash-latest');
			await page.locator('.save').scrollIntoViewIfNeeded();
		}
	},
	// The pending invite's code, random per seed.
	{
		name: 'members',
		route: '/(app)/settings/members',
		path: '/settings/members',
		mask: ['.invite .pending']
	},
	// The add-a-recipe screens [3d]: import by link (AI off for this household, so
	// the plain link field), and the empty editor.
	{
		name: 'recipe-import',
		route: '/(app)/cooking/recipes/import',
		path: '/cooking/recipes/import'
	},
	{
		name: 'recipe-new',
		route: '/(app)/cooking/recipes/new',
		path: '/cooking/recipes/new',
		bottom: true
	},
	// The recipe filters (→ plan 40), on the sketch's tagged library
	// (`--cookbook`): the row at rest, a filtered grid, the sheet, the ways out
	// of "nothing fits", a recipe's tags and heart, and the form's Tags block.
	{
		name: 'recipes-cookbook',
		route: '/(app)/cooking/recipes',
		path: '/cooking/recipes',
		account: 'cookbook'
	},
	{
		name: 'recipes-filtered',
		route: '/(app)/cooking/recipes',
		path: '/cooking/recipes?meal=dinner&diet=vegetarian&sort=quick',
		account: 'cookbook'
	},
	{
		name: 'recipes-filter-sheet',
		route: '/(app)/cooking/recipes',
		path: '',
		account: 'cookbook',
		navigate: async (page) => {
			await page.goto('/cooking/recipes?meal=dinner');
			await page.getByRole('button', { name: 'Filter, 1 on' }).click();
			await page.getByRole('dialog', { name: 'Filter recipes' }).waitFor();
		}
	},
	{
		name: 'recipes-nothing-fits',
		route: '/(app)/cooking/recipes',
		path: '/cooking/recipes?meal=dinner&diet=vegan&max=30',
		account: 'cookbook'
	},
	{
		name: 'recipe-tags',
		route: '/(app)/cooking/recipes/[id]',
		path: '',
		account: 'cookbook',
		navigate: openPumpkinSoup
	},
	// The sorting pass (→ plan 41): the cookbook's first untagged recipe, its
	// diet guessed from the ingredients and dotted.
	{
		name: 'recipe-sort',
		route: '/(app)/cooking/recipes/sort',
		path: '/cooking/recipes/sort',
		account: 'cookbook'
	},
	{
		name: 'recipe-edit-tags',
		route: '/(app)/cooking/recipes/[id]/edit',
		path: '',
		account: 'cookbook',
		navigate: async (page) => {
			await openPumpkinSoup(page);
			await page.goto(`${new URL(page.url()).pathname}/edit`);
			await page.getByText('Tags', { exact: true }).scrollIntoViewIfNeeded();
		}
	},
	{ name: 'stores', route: '/(app)/shopping/stores', path: '/shopping/stores' },
	// Onboarding [5a]–[5d], each as a fresh sign-up meets it. The invite step's
	// code is random, so it is masked — in the card and in the link under it.
	{
		name: 'onboarding',
		route: '/onboarding',
		path: '',
		navigate: async (page) => {
			await freshAccount(page);
			await page.goto('/onboarding');
			await page.getByRole('heading', { name: 'Welcome, Fresh' }).waitFor();
		},
		// The fresh account's address is random; "Signed in as" names it.
		mask: ['.account span'],
		fullPage: true
	},
	{
		name: 'onboarding-create',
		route: '/onboarding/create',
		path: '',
		navigate: async (page) => {
			await freshAccount(page);
			await page.goto('/onboarding/create');
			await page.getByLabel('Household name').waitFor();
		},
		fullPage: true
	},
	{
		name: 'onboarding-invite',
		route: '/onboarding/invite',
		path: '',
		navigate: async (page) => {
			await freshAccount(page);
			await page.goto('/onboarding/create');
			await page.getByLabel('Household name').fill('Testgasse 1');
			await page.getByLabel('Your display name').fill('Fresh');
			await page.getByRole('button', { name: 'Continue' }).click();
			await page.waitForURL(/\/onboarding\/invite$/);
			await page.locator('.code').waitFor();
		},
		mask: ['.code', '.link .url'],
		fullPage: true
	},
	{
		name: 'onboarding-join',
		route: '/onboarding/join',
		path: '',
		navigate: async (page) => {
			await freshAccount(page);
			await page.goto('/onboarding/join');
			await page.getByRole('heading', { level: 1 }).waitFor();
		},
		fullPage: true
	},
	// The public invite landing [5e], as someone who got the link sees it: signed
	// out, the household's real code. The code is random per seed, so read it off
	// the members screen first; the landing itself never prints it.
	{
		name: 'invite',
		route: '/j/[code]',
		path: '',
		navigate: async (page) => {
			await page.goto('/settings/members');
			const detail = await page.locator('.invite .pending .detail').innerText();
			const code = detail.match(/[A-Z2-9]{3}-?[A-Z2-9]{3}/)?.[0];
			expect(code, `an invite code in "${detail}"`).toBeTruthy();
			await page.context().clearCookies();
			await page.goto(`/j/${code!.replace('-', '')}`);
			await page.getByRole('heading', { level: 1 }).waitFor();
		},
		fullPage: true
	}
];

export async function settle(page: Page): Promise<void> {
	// Self-hosted fonts and recipe images arrive after first paint; a screenshot
	// before them is a fallback face or a blank card, and a flaky diff.
	await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all(
			Array.from(document.images)
				.filter((img) => !img.complete)
				.map((img) => new Promise((done) => img.addEventListener('load', done, { once: true })))
		);
	});
}

/**
 * A mask that matches nothing masks nothing — and Playwright says nothing. So a
 * renamed class would quietly un-mask a random code and fail on every PR for a
 * reason nobody caused.
 */
export async function masksFor(page: Page, selectors: string[]) {
	const masks = selectors.map((selector) => page.locator(selector));
	for (const [index, mask] of masks.entries()) {
		expect(await mask.count(), `mask "${selectors[index]}" matches nothing`).toBeGreaterThan(0);
	}
	return masks;
}

export async function scrolledToBottom(page: Page): Promise<void> {
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await page.waitForTimeout(250);
}
