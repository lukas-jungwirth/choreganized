/**
 * The home screen's recent-activity card [8b] (→ SPEC §1.6): it only ever
 * shows completed tasks, so its title has to say so in every language.
 */
import { expect, test } from '@playwright/test';

test.describe('recent activity', () => {
	// Every other test reads English; restore it so a later test doesn't inherit German.
	test.afterEach(async ({ page, baseURL }) => {
		const restored = await page.request.post('/settings?/language', {
			form: { locale: 'en' },
			headers: { origin: baseURL! },
			maxRedirects: 0
		});
		expect([200, 303]).toContain(restored.status());
	});

	test('reads "Zuletzt erledigt" in German, not "Zuletzt passiert"', async ({ page, baseURL }) => {
		const switched = await page.request.post('/settings?/language', {
			form: { locale: 'de' },
			headers: { origin: baseURL! },
			maxRedirects: 0
		});
		expect([200, 303]).toContain(switched.status());

		await page.goto('/home');
		await expect(page.getByText('Zuletzt erledigt', { exact: true })).toBeVisible();
		await expect(page.getByText('Zuletzt passiert')).not.toBeVisible();
	});
});
