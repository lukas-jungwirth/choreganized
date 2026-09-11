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
 * Masks cover what changes with the calendar: the greeting follows the hour,
 * standings the month, due labels and "added on" / "joined" lines the day. A
 * screen whose whole body is the calendar (the week plan, history) is not here
 * at all.
 */
import { expect, test, type Page } from '@playwright/test';
import { SEED } from '../e2e/accounts';

test.skip(
	process.platform !== 'linux',
	'Visual baselines are Linux-only — run `npm run test:visual` (Docker) or let CI compare.'
);

/** The greeting follows the hour, standings the month, due labels the day. */
const HOME_MASKS = ['h1', '.strip', '.chore .meta', '.activity .meta'];

type Screen = {
	name: string;
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
	await page.getByRole('heading', { level: 1 }).waitFor();
}

const SCREENS: Screen[] = [
	{ name: 'login', path: '/login', signedOut: true, fullPage: true },
	{ name: 'kit-light', path: '/dev/kit', fullPage: true },
	{ name: 'kit-dark', path: '/dev/kit', theme: 'dark', fullPage: true },
	{ name: 'home', path: '/home', mask: HOME_MASKS, bottom: true },
	{ name: 'home-dark', path: '/home', theme: 'dark', mask: HOME_MASKS },
	{ name: 'shopping', path: '/shopping', bottom: true },
	{ name: 'shopping-dark', path: '/shopping', theme: 'dark' },
	// `.footer` is the overdue row's "reminded yesterday & this morning" line.
	{
		name: 'tasks',
		path: '/tasks',
		mask: ['.task .meta', '.task .footer', '.summary'],
		bottom: true
	},
	// A card's "30 min · added Sep 11".
	{ name: 'recipes', path: '/cooking/recipes', mask: ['.meta'] },
	{ name: 'recipe', path: '', navigate: openRecipe, bottom: true },
	{
		name: 'cook-mode',
		path: '',
		navigate: async (page) => {
			await openRecipe(page);
			await page.getByRole('link', { name: 'Start cook mode' }).click();
			await page.getByText(/^Step 1 of/).waitFor();
		}
	},
	{ name: 'settings', path: '/settings', bottom: true },
	{ name: 'settings-dark', path: '/settings', theme: 'dark', bottom: true },
	// "Owner · joined Sep 11", and the pending invite's code, random per seed.
	{ name: 'members', path: '/settings/members', mask: ['.member .meta', '.invite .pending'] }
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
 * renamed class would quietly un-mask the calendar, pass until the month rolls,
 * and then fail on every PR for a reason nobody caused.
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
