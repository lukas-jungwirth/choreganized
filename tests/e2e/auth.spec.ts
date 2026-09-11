/**
 * The doors (→ SPEC §1.6, DECISIONS #20, #89). Signed out on purpose: what a
 * stranger gets is the one thing no seeded session can show.
 */
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('a stranger lands on the sign-in page, wherever they aimed', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();

	await page.goto('/home');
	await expect(page).toHaveURL(/\/login$/);

	await page.goto('/settings');
	await expect(page).toHaveURL(/\/login$/);
});

test('the JSON endpoints answer with a status, not a redirect', async ({ request }) => {
	// POST: the timers endpoint has no GET, and a 405 would prove nothing.
	const timers = await request.post('/api/timers', { maxRedirects: 0, data: {} });
	expect(timers.status()).toBe(401);

	const live = await request.get('/api/live', { maxRedirects: 0 });
	expect(live.status()).toBe(401);
});

test('/api/health names the build and is never cached', async ({ request }) => {
	const response = await request.get('/api/health');

	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe('no-store');
	expect(await response.json()).toMatchObject({ ok: true, version: 'e2e' });
});

test('this build has the E2E door open — which the smoke test asserts is shut on a deploy', async ({
	request
}) => {
	const kit = await request.get('/dev/kit');
	expect(kit.status()).toBe(200);
});

test('the production build serves the PWA plumbing', async ({ request }) => {
	const manifest = await request.get('/manifest.webmanifest');
	expect(manifest.ok()).toBe(true);
	expect(await manifest.json()).toMatchObject({ name: 'Choreganized', display: 'standalone' });

	const worker = await request.get('/service-worker.js');
	expect(worker.ok()).toBe(true);
	expect(worker.headers()['content-type']).toContain('javascript');
});
