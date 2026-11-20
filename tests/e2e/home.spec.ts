/**
 * The home screen [8b]: the recent-activity card (→ SPEC §1.6), which only
 * ever shows completed tasks, so its title has to say so in every language; and
 * the next-chore card, which swipes when more than one chore is on you (§2.1).
 */
import { expect, test } from '@playwright/test';
import { finger } from './touch';

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

/**
 * More than one chore on you: the top card becomes a stack you swipe through
 * (→ SPEC §2.1, DECISIONS #256). The seed puts three in the owner's window: the
 * fridge (a day late, Anyone), the plants (today) and the bins (tomorrow).
 */
test.describe('the next-chore stack', () => {
	test('swipes through every chore on you, one full-width card at a time', async ({ page }) => {
		await page.goto('/home');
		const stack = page.getByRole('region', { name: 'Your next chore' });
		const cards = stack.getByRole('listitem');
		await expect(cards).toHaveCount(3);

		const first = cards.nth(0);
		const second = cards.nth(1);
		await expect(first.getByRole('heading', { name: 'Clean the fridge' })).toBeInViewport();
		await expect(first).toContainText('1 of 3');
		await expect(second).toContainText('Also on you');
		await expect(second).toContainText('2 of 3');
		// No peek: the next card starts past the screen's edge.
		await expect(second).not.toBeInViewport();

		const dots = stack.locator('.dots i');
		await expect(dots.nth(0)).toHaveClass(/on/);

		await finger(page)(first, -220);
		await expect(second).toBeInViewport({ ratio: 0.95 });
		await expect(first).not.toBeInViewport();
		await expect(dots.nth(1)).toHaveClass(/on/);

		// The page itself never scrolls sideways; only the stack does.
		const overflow = await page.evaluate(
			() => document.scrollingElement!.scrollWidth - window.innerWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);

		// The raccoon stays the first card's, whichever one is in view.
		await expect(page.locator('header img.mascot')).toHaveAttribute('src', /reminder-overdue/);
	});

	test('a chore done leaves the stack, and Undo brings it back', async ({ page }) => {
		await page.goto('/home');
		const stack = page.getByRole('region', { name: 'Your next chore' });
		const cards = stack.getByRole('listitem');
		await expect(cards).toHaveCount(3);

		const plants = cards.filter({ hasText: 'Water the plants' });
		// Reachable without a swipe: Tab scrolls it into view like any control.
		await plants.getByRole('button', { name: 'Mark done' }).focus();
		await expect(plants).toBeInViewport({ ratio: 0.95 });
		await plants.getByRole('button', { name: 'Mark done' }).click();

		const modal = page.getByRole('dialog');
		await expect(modal).toBeVisible();
		await expect(cards).toHaveCount(2);
		await expect(cards.nth(1)).toContainText('2 of 2');

		await modal.getByRole('button', { name: 'Undo' }).click();
		await expect(cards).toHaveCount(3);
	});
});

/**
 * Home's one way into Settings is the gear in the header's corner; the faces
 * under the greeting are a picture of the household, not a button (→ SPEC §2,
 * DECISIONS #264).
 */
test.describe('the way into Settings', () => {
	test.afterEach(async ({ page, baseURL }) => {
		const restored = await page.request.post('/settings?/language', {
			form: { locale: 'en' },
			headers: { origin: baseURL! },
			maxRedirects: 0
		});
		expect([200, 303]).toContain(restored.status());
	});

	test('the gear opens Settings, and its back chevron returns Home', async ({ page }) => {
		await page.goto('/home');
		const faces = page.getByRole('img', { name: /^Household: / });
		await expect(faces).toBeVisible();
		await expect(faces).toHaveAccessibleName(/Elisabeth/);
		// The faces are no control any more, and the gear is the header's one link.
		await expect(page.locator('header a', { has: faces })).toHaveCount(0);
		await expect(page.locator('header a')).toHaveCount(1);

		await page.getByRole('link', { name: 'Settings', exact: true }).click();
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

		await page.getByRole('link', { name: 'Back to home' }).click();
		await expect(page).toHaveURL(/\/home$/);
	});

	/**
	 * The raccoon hangs from the header's bottom edge, so a short greeting is the
	 * worst case: German's "Guten Tag," fits one line where "Good afternoon,"
	 * wraps (every run is the same afternoon, → TESTING "The fixed clock"). At the
	 * old 170px header the raccoon's picture started 2px above the gear's bottom
	 * edge, and some poses draw right up to the top of their picture.
	 */
	for (const locale of ['en', 'de'] as const) {
		test(`the gear clears the raccoon by at least 8px (${locale})`, async ({ page, baseURL }) => {
			const switched = await page.request.post('/settings?/language', {
				form: { locale },
				headers: { origin: baseURL! },
				maxRedirects: 0
			});
			expect([200, 303]).toContain(switched.status());

			await page.goto('/home');
			const gear = page.locator('header a[href="/settings"]');
			const raccoon = page.locator('header img.mascot');
			await expect(gear).toBeVisible();
			await expect(raccoon).toBeVisible();

			const [g, r] = await Promise.all([gear.boundingBox(), raccoon.boundingBox()]);
			expect(r!.y - (g!.y + g!.height)).toBeGreaterThanOrEqual(8);
			// …and it is the raccoon's column it sits over, not one beside it.
			expect(g!.x + g!.width).toBeGreaterThan(r!.x);
		});
	}
});
