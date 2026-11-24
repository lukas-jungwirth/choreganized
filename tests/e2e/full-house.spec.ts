/**
 * A household with a member per colour, eight (→ `--full-house`, DECISIONS
 * #296): the places that list everybody still fit a 390px phone, and a ninth
 * person is told the household is full instead of being handed a form that can
 * only fail. Signed in as the `fullhouse` account, which only this spec
 * mutates, and only to undo it again.
 */
import { expect, test } from '@playwright/test';
import { storageStateFor } from './accounts';
import { freshAccount } from '../visual/screens';

test.use({ storageState: storageStateFor('fullhouse') });

test('the standings strip shows four faces and counts the rest', async ({ page }) => {
	await page.goto('/home');
	const strip = page.locator('a[href="/tasks/history"]').filter({ hasText: 'this month' });
	await expect(strip.getByText('+4', { exact: true })).toBeVisible();
	// Its text keeps the room the design gave it with five people: two lines,
	// not the four a stack of eight discs squeezed it into.
	const title = strip.locator('.title');
	const { height } = (await title.boundingBox())!;
	expect(height).toBeLessThan(30);
});

test('“Who did it?” puts eight faces in two rows, names whole', async ({ page }) => {
	await page.goto('/tasks');
	await page
		.getByRole('button', { name: /^Mark .* done$/ })
		.first()
		.click();
	const modal = page.getByRole('dialog');
	const faces = modal.getByRole('group', { name: 'Who did it?' }).getByRole('button');
	await expect(faces).toHaveCount(8);

	const tops = await faces.evaluateAll((buttons) =>
		buttons.map((button) => Math.round(button.getBoundingClientRect().top))
	);
	expect(new Set(tops).size, `rows at ${tops.join(', ')}`).toBe(2);
	const cut = await faces.evaluateAll((buttons) =>
		buttons
			.map((button) => button.querySelector('.name')!)
			.filter((name) => name.scrollWidth > name.clientWidth)
			.map((name) => name.textContent!.trim())
	);
	expect(cut).toEqual([]);

	await modal.getByRole('button', { name: 'Undo' }).click();
	await expect(modal).toBeHidden();
});

test('a ninth person is told the household is full', async ({ page }) => {
	await page.goto('/settings/members');
	const detail = await page.locator('.invite .pending .detail').innerText();
	const code = detail.match(/[A-Z2-9]{3}-?[A-Z2-9]{3}/)?.[0];
	expect(code, `an invite code in "${detail}"`).toBeTruthy();

	await freshAccount(page);
	await page.goto(`/onboarding/join?code=${code!.replace('-', '')}`);
	await expect(page.getByRole('alert')).toHaveText(
		/This household is full: it already has 8 people/
	);
	await expect(page.getByRole('button', { name: 'Join household' })).toHaveCount(0);
});

test('a taken colour shows its wearer’s initial and stays unpickable', async ({ page }) => {
	// → DECISIONS #301: not a faded dot, which read as broken.
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Edit' }).first().click();
	const picker = page.getByRole('radiogroup', { name: 'Your colour' });
	await expect(picker.getByRole('radio', { disabled: true })).toHaveCount(7);
	const taken = picker.locator('.unavailable');
	await expect(taken).toHaveCount(7);
	const looks = await taken.evaluateAll((labels) =>
		labels.map((label) => {
			const disc = label.querySelector('.avatar')!;
			const style = getComputedStyle(disc);
			return {
				letter: disc.textContent!.trim(),
				opacity: style.opacity
			};
		})
	);
	for (const look of looks) {
		expect(look.letter).toMatch(/^\p{Lu}$/u);
		expect(look.opacity).toBe('1');
	}
	await taken.first().click({ force: true });
	await expect(picker.getByRole('radio', { checked: true })).not.toBeDisabled();
});
