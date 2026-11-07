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
