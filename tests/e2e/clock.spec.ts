/**
 * The fixed clock (→ docs/TESTING.md "The fixed clock", DECISIONS #184). The
 * browser's shift is computed from the server's `Date.now()`, so a page reading
 * the run's afternoon proves the server, the injected script and this worker
 * all keep the same clock.
 */
import { expect, test } from '@playwright/test';

test('every part of a run reads the same fixed afternoon', async ({ page }) => {
	const fixed = Date.parse(process.env.FIXED_CLOCK ?? '');
	expect(Math.abs(Date.now() - fixed), 'the test worker').toBeLessThan(10 * 60_000);

	await page.goto('/home');
	const inBrowser = await page.evaluate(() => Date.now());
	expect(Math.abs(inBrowser - Date.now()), 'the browser, against the worker').toBeLessThan(60_000);
	expect(await page.evaluate(() => new Date().getFullYear())).toBe(new Date(fixed).getFullYear());
});
