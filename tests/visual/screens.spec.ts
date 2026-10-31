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
import { expect, test } from '@playwright/test';
import { masksFor, SCREENS, scrolledToBottom, settle } from './screens';

test.skip(
	process.platform !== 'linux',
	'Visual baselines are Linux-only — run `npm run test:visual` (Docker) or let CI compare.'
);

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
