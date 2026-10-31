/**
 * The bottom sheet's handle does what it looks like (→ DECISIONS #205): drag it
 * down far enough, or flick it, and the sheet closes; a short drag or a pull
 * upwards springs back. Driven with the mouse, which sends the same pointer
 * events a finger does.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

async function openSheet(page: Page): Promise<Locator> {
	await page.goto('/expenses');
	await page.getByRole('button', { name: 'Add expense' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add expense' });
	const panel = sheet.locator('.panel');
	await expect(panel).toBeVisible();
	// Measure from rest, not halfway through the rise.
	await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
	return sheet;
}

/** Press on the handle, move `dy` in `steps`, let go. */
async function dragHandle(page: Page, sheet: Locator, dy: number, steps: number) {
	const box = (await sheet.locator('.handle').boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= steps; i++) {
		await page.mouse.move(x, y + (dy * i) / steps);
		await page.waitForTimeout(16);
	}
	await page.mouse.up();
}

test('dragging the handle past a third of the sheet closes it', async ({ page }) => {
	const sheet = await openSheet(page);
	const height = (await sheet.locator('.panel').boundingBox())!.height;
	await dragHandle(page, sheet, height / 2, 20);
	await expect(sheet).toBeHidden();
});

test('a short drag springs back, and so does a pull upwards', async ({ page }) => {
	const sheet = await openSheet(page);
	const panel = sheet.locator('.panel');
	const rest = (await panel.boundingBox())!.y;

	await dragHandle(page, sheet, 20, 10);
	await expect(sheet).toBeVisible();
	await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(rest, 0);

	await dragHandle(page, sheet, -200, 10);
	await expect(sheet).toBeVisible();
	await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(rest, 0);
});

test('the × in the header is still a button, not the start of a drag', async ({ page }) => {
	const sheet = await openSheet(page);
	await sheet.getByRole('button', { name: 'Close' }).click();
	await expect(sheet).toBeHidden();
});
