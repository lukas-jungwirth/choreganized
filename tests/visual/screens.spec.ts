/**
 * Visual regression (→ docs/TESTING.md "Visual", DECISIONS #140).
 *
 * One screenshot per screen at the design's 390×844 frame — the viewport, not
 * the full page, because the tab bar is `position: fixed` and a full-page
 * capture paints it in the middle of the content; long screens get a second
 * shot scrolled to the bottom instead — against the `visual` household, seeded
 * like the other one and never mutated. The baselines under `__screenshots__/`
 * are made on Linux only, in the same container CI runs (`npm run test:visual`),
 * because a macOS Chromium renders text differently enough to fail every one
 * of them.
 *
 * Every run happens on the same afternoon (→ playwright.config.ts, "The fixed
 * clock" in docs/TESTING.md), so greetings, due labels, day heads and "added on"
 * lines are part of the picture, not masked. Masks are left for what is random
 * (an invite code) or stamped at the minute the seed ran. A screen whose whole
 * body is the calendar (the week plan, history) is still not here — it is
 * excused in tests/conventions/visual-coverage.test.ts, which fails for any page
 * that is neither here nor excused. Each screen names its `route` for that test.
 */
import { expect, test, type Page } from '@playwright/test';
import { SEED } from '../e2e/accounts';

test.skip(
	process.platform !== 'linux',
	'Visual baselines are Linux-only — run `npm run test:visual` (Docker) or let CI compare.'
);

type Screen = {
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
};

async function openRecipe(page: Page): Promise<void> {
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

/**
 * A brand-new sign-up with no household, for the onboarding screens — the only
 * way to reach them, since both seeded accounts own one. A new account per test
 * (→ tests/e2e/onboarding.spec.ts), so nothing here touches the `visual`
 * household. The name is fixed: "Welcome, Fresh" is on the screen.
 */
async function freshAccount(page: Page): Promise<void> {
	await page.context().clearCookies();
	const email = `visual-fresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
	const signUp = await page.request.post('/api/auth/sign-up/email', {
		data: { name: 'Fresh Person', email, password: 'e2e-password-fresh' }
	});
	expect(signUp.ok()).toBe(true);
}

/** [9b] with an amount and a description typed, as it looks just before Save. */
async function openAddExpense(page: Page): Promise<void> {
	await page.goto('/expenses');
	await page.getByRole('button', { name: 'Add expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	await sheet.getByLabel('Amount').fill('42.10');
	await sheet.getByLabel('What for?').fill('Weekly shop · Billa');
	await sheet.getByLabel('What for?').blur();
}

async function openAiFeatures(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByRole('button', { name: /^AI features/ }).click();
	await page
		.getByRole('dialog')
		.getByText(/free tiers have limits/)
		.waitFor();
}

const SCREENS: Screen[] = [
	{ name: 'login', route: '/login', path: '/login', signedOut: true, fullPage: true },
	{ name: 'kit-light', route: '/dev/kit', path: '/dev/kit', fullPage: true },
	{ name: 'kit-dark', route: '/dev/kit', path: '/dev/kit', theme: 'dark', fullPage: true },
	{ name: 'home', route: '/(app)/home', path: '/home', bottom: true },
	{ name: 'home-dark', route: '/(app)/home', path: '/home', theme: 'dark' },
	{ name: 'shopping', route: '/(app)/shopping', path: '/shopping', bottom: true },
	{ name: 'shopping-dark', route: '/(app)/shopping', path: '/shopping', theme: 'dark' },
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
	{ name: 'settings', route: '/(app)/settings', path: '/settings', bottom: true },
	{
		name: 'settings-dark',
		route: '/(app)/settings',
		path: '/settings',
		theme: 'dark',
		bottom: true
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

async function settle(page: Page): Promise<void> {
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
async function masksFor(page: Page, selectors: string[]) {
	const masks = selectors.map((selector) => page.locator(selector));
	for (const [index, mask] of masks.entries()) {
		expect(await mask.count(), `mask "${selectors[index]}" matches nothing`).toBeGreaterThan(0);
	}
	return masks;
}

async function scrolledToBottom(page: Page): Promise<void> {
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await page.waitForTimeout(250);
}

for (const screen of SCREENS) {
	test(screen.name, async ({ page, context, baseURL }) => {
		if (screen.signedOut) await context.clearCookies();
		if (screen.theme) {
			await context.addCookies([
				{ name: 'theme', value: screen.theme, url: baseURL!, sameSite: 'Lax' }
			]);
		}

		if (screen.navigate) await screen.navigate(page);
		else await page.goto(screen.path);
		await settle(page);

		const mask = await masksFor(page, screen.mask ?? []);
		await expect(page).toHaveScreenshot(`${screen.name}.png`, {
			fullPage: screen.fullPage ?? false,
			mask
		});

		if (screen.bottom) {
			await scrolledToBottom(page);
			await expect(page).toHaveScreenshot(`${screen.name}-bottom.png`, { mask });
		}
	});
}
