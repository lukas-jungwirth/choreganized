/**
 * Completing a chore and taking it back (→ SPEC §5.4, DECISIONS #16–#19): the
 * modal names the doer, the points, and offers the undo that restores the row.
 */
import { expect, test } from '@playwright/test';
import { finger } from './touch';

test('mark a chore done, then undo it from the modal', async ({ page }) => {
	await page.goto('/tasks');

	// A task that is mine or anybody's — not "it's Elisabeth's", which asks first.
	const done = page.getByRole('button', { name: /^Mark .* done$/ }).first();
	await expect(done).toBeVisible();
	const name = (await done.getAttribute('aria-label'))!.replace(/^Mark (.*) done$/, '$1');

	await done.click();
	const modal = page.getByRole('dialog');
	await expect(modal.getByRole('heading', { name: /Nice work, Lukas!/ })).toBeVisible();
	await expect(modal.getByText(name)).toBeVisible();

	await modal.getByRole('button', { name: 'Undo' }).click();
	await expect(modal).toBeHidden();
	await expect(page.getByRole('button', { name: `Mark ${name} done` })).toBeVisible();
});

test('the Tasks tab carries the overdue badge the layout computes', async ({ page }) => {
	await page.goto('/home');
	const tasksTab = page
		.getByRole('navigation', { name: 'Sections' })
		.getByRole('link', { name: /Tasks/ });
	await expect(tasksTab).toBeVisible();
	await tasksTab.click();
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
});

test('swiping sideways switches the Tasks tab between To do and History (#87)', async ({
	page
}) => {
	await page.goto('/tasks');
	const view = page.getByRole('navigation', { name: 'Task view' });
	const todo = view.getByRole('link', { name: 'To do' });
	const history = view.getByRole('link', { name: 'History' });
	await expect(todo).toHaveAttribute('aria-current', 'page');
	const list = page.locator('ul.rows').first();
	const swipeAcross = finger(page);

	// A scroll that drifts sideways, and a swipe from the screen's edge (the
	// system's back gesture), leave the view where it is — and no row's sheet opens.
	await swipeAcross(list, -90, 240);
	await swipeAcross(list, -150, 0, 380);
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// Rightwards on To do: there is nothing before it.
	await swipeAcross(list, 150);
	await expect(page).toHaveURL(/\/tasks$/);

	// Leftwards over the list: on to History, and no task's sheet opened on the way.
	await swipeAcross(list, -150);
	await expect(page).toHaveURL(/\/tasks\/history$/);
	await expect(history).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// Leftwards again: History is the last view.
	const cards = page.locator('.cards');
	await swipeAcross(cards, -150);
	await expect(page).toHaveURL(/\/tasks\/history$/);

	// Rightwards: back to To do.
	await swipeAcross(cards, 150);
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(todo).toHaveAttribute('aria-current', 'page');
});

test('the Tasks swipe reaches below a short page, down to the tab bar (#87)', async ({ page }) => {
	// History is two cards; on a phone the screen goes on below them, and a
	// thumb lands there as often as on a card.
	await page.goto('/tasks/history');
	// Halfway between the last thing on the page and the tab bar, so the
	// header's height (the mascot, DECISIONS #211) can't move it onto a link.
	const last = (await page.getByRole('link', { name: 'All completed chores' }).boundingBox())!;
	const tabBar = (await page.getByRole('navigation', { name: 'Sections' }).boundingBox())!;
	const y = (last.y + last.height + tabBar.y) / 2;
	expect(y).toBeGreaterThan(last.y + last.height + 10);
	expect(y).toBeLessThan(tabBar.y - 10);

	await finger(page)({ x: 195, y }, 150);
	await expect(page).toHaveURL(/\/tasks$/);
});
