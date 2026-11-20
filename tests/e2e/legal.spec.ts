/**
 * Impressum and Datenschutz (→ SPEC §13). The e2e server sets both variables
 * with made-up text (→ scripts/e2e-legal.ts); with them unset the pages are a
 * 404 and the links are gone, which tests/integration/legal-pages.test.ts
 * covers, since this server's environment can't change mid-run.
 */
import { expect, test, type Page } from '@playwright/test';

/** The chevron in the SubHeader, and where it leads. */
const back = (page: Page) => page.getByRole('link', { name: 'Back', exact: true });

test.describe('signed out', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('sign-in offers both pages; back returns to sign-in, the cross-link keeps it', async ({
		page
	}) => {
		await page.goto('/login');
		const legal = page.getByRole('navigation', { name: 'Legal' });
		await expect(legal.getByRole('link')).toHaveText(['Privacy', 'Imprint']);

		await legal.getByRole('link', { name: 'Imprint' }).click();
		await expect(page).toHaveURL(/\/legal\/imprint\?from=login$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Imprint' })).toBeVisible();
		// The operator's text as written: the `\n`s are line breaks, the address a link.
		await expect(page.getByText('Erika Musterfrau')).toBeVisible();
		await expect(page.getByText('1234 Musterstadt')).toBeVisible();
		await expect(page.getByRole('link', { name: 'kontakt@example.com' })).toHaveAttribute(
			'href',
			'mailto:kontakt@example.com'
		);

		await page.getByRole('link', { name: 'Privacy' }).click();
		await expect(page).toHaveURL(/\/legal\/privacy\?from=login$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2, name: 'Cookies' })).toBeVisible();
		await expect(page.getByRole('listitem').filter({ hasText: 'recipe photos' })).toBeVisible();
		const more = page.getByRole('link', { name: 'https://example.com/datenschutz' });
		await expect(more).toHaveAttribute('href', 'https://example.com/datenschutz');
		await expect(more).toHaveAttribute('target', '_blank');

		await back(page).click();
		await expect(page).toHaveURL(/\/login$/);
	});

	test('the invite landing has the same pair', async ({ page }) => {
		// A code no household has: the landing still renders, and back can't
		// return to an invite that isn't one, so it goes to sign-in.
		await page.goto('/j/ZZZZZZ');
		const legal = page.getByRole('navigation', { name: 'Legal' });
		await legal.getByRole('link', { name: 'Privacy' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
		await expect(back(page)).toHaveAttribute('href', '/login');
	});

	test('an unknown from falls back to sign-in, never to the address it names', async ({ page }) => {
		await page.goto('/legal/imprint?from=https://evil.example');
		await expect(back(page)).toHaveAttribute('href', '/login');
		// …and the cross-link doesn't carry it on.
		await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
			'href',
			'/legal/privacy'
		);
	});

	test('a page that isn’t one is a 404', async ({ page }) => {
		const response = await page.goto('/legal/terms');
		expect(response?.status()).toBe(404);
	});

	test('the page follows the reader’s language; the text stays as written', async ({ browser }) => {
		const context = await browser.newContext({ locale: 'de-AT' });
		const page = await context.newPage();
		await page.goto('/legal/imprint');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de-AT');
		await expect(page.getByRole('heading', { level: 1, name: 'Impressum' })).toBeVisible();
		await expect(page.getByText('Haushaltsheld is a private project')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Datenschutz' })).toBeVisible();
		await context.close();
	});
});

test.describe('signed in', () => {
	test('Settings → About opens both pages, and back returns to Settings', async ({ page }) => {
		await page.goto('/settings');
		for (const name of ['Privacy', 'Imprint']) {
			await page.getByRole('link', { name, exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/legal/${name.toLowerCase()}\\?from=settings$`));
			await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
			await back(page).click();
			await expect(page).toHaveURL(/\/settings$/);
		}
	});

	test('with no from, back goes to Settings', async ({ page }) => {
		await page.goto('/legal/privacy?from=nowhere');
		await expect(back(page)).toHaveAttribute('href', '/settings');
	});
});
