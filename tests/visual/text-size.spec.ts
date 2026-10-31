/**
 * Every screen at twice the reader's text size (→ DESIGN-SYSTEM "Type scale",
 * DECISIONS #201). A phone set to large text raises the root font size — Chrome
 * on Android through `<meta name="text-scale">`, Safari through Dynamic Type —
 * and every `--fs-*` token follows it, up to its cap. Here the root is set to
 * 200% by hand, which is exactly what those settings do, and each screen has to:
 *
 * - actually scale: body text doubles from 17px to 34px. Before the type was
 *   built on `rem` this read 17.6px whatever the setting, and nothing failed;
 * - still fit across: no sideways scroll at 390px (WCAG 1.4.10, reflow);
 * - show its words: a one-line box (`nowrap`, `overflow: hidden`) that cuts its
 *   text off without an ellipsis has lost content (WCAG 1.4.4, resize text).
 *
 * German runs longest ("Rezeptsammlung", "Abbrechen" beside "Speichern"), so the
 * screens a URL reaches are walked in it too; the rest are reached by clicking
 * English names. No screenshots, so it runs anywhere — the look at 100% is
 * screens.spec.ts's job. Dark twins are skipped: the theme moves colour, not size.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { SCREENS, scrolledToBottom, settle, type Screen } from './screens';

const ROOT_SCALE = 2;
const BODY_PX = 17;

async function atTwiceTheTextSize(page: Page, context: BrowserContext, screen: Screen) {
	if (screen.signedOut) await context.clearCookies();
	await page.addInitScript((scale) => {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(`html { font-size: ${scale * 100}% }`);
		document.adoptedStyleSheets = [sheet];
	}, ROOT_SCALE);

	if (screen.navigate) await screen.navigate(page);
	else await page.goto(screen.path);
	await settle(page);

	const bodyPx = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
	expect(bodyPx, 'body text follows the reader’s text size').toBe(BODY_PX * ROOT_SCALE);

	for (const where of screen.bottom ? ['top', 'bottom'] : ['top']) {
		if (where === 'bottom') await scrolledToBottom(page);
		const fit = await page.evaluate(() => ({
			page: document.documentElement.scrollWidth,
			clipped: Array.from(document.querySelectorAll<HTMLElement>('body *'))
				.filter((el) => {
					const style = getComputedStyle(el);
					return (
						style.whiteSpace === 'nowrap' &&
						style.overflowX !== 'visible' &&
						style.textOverflow !== 'ellipsis' &&
						// Visually hidden text (`.sr-only`, the route announcer) is a 1px box on purpose.
						el.clientWidth > 1 &&
						el.clientHeight > 1 &&
						style.opacity !== '0' &&
						el.checkVisibility() &&
						[...el.childNodes].some((node) => node.nodeType === 3 && node.textContent!.trim()) &&
						el.scrollWidth > el.clientWidth + 1
					);
				})
				.map((el) => `${el.tagName.toLowerCase()}.${el.className}: "${el.textContent!.trim()}"`)
		}));
		expect(fit.page, `the ${where} of ${screen.name} scrolls sideways`).toBeLessThanOrEqual(
			page.viewportSize()!.width
		);
		expect(fit.clipped, `text cut off at the ${where} of ${screen.name}`).toEqual([]);
	}
}

for (const screen of SCREENS.filter((screen) => !screen.theme)) {
	test(`${screen.name} at 200% text`, async ({ page, context }) => {
		await atTwiceTheTextSize(page, context, screen);
	});
}

test.describe('in German', () => {
	test.use({ locale: 'de-AT' });

	for (const screen of SCREENS.filter((screen) => !screen.theme && !screen.navigate)) {
		test(`${screen.name} at 200% text`, async ({ page, context }) => {
			await atTwiceTheTextSize(page, context, screen);
		});
	}
});
