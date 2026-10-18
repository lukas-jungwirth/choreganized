/**
 * Amounts in a step's sentence, cooking for a different number of people
 * (→ plan 23, DECISIONS #149). The interesting half is what must **not**
 * change: every number that isn't an ingredient's amount, and every amount the
 * recipe doesn't vouch for. A wrong number in an instruction is worse than an
 * unscaled one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { scaleIngredients } from './ingredients';
import { readStep, scaleStepUses, type StepUse } from './step-highlight';
import { scaleStepAmounts } from './step-amounts';

type Row = { id: string; name: string; quantity: number | null; unit: string | null };

const rows: Row[] = [
	{ id: 'tom', name: 'Tomaten', quantity: 4, unit: null },
	{ id: 'mehl', name: 'Mehl', quantity: 500, unit: 'g' },
	{ id: 'oil', name: 'Olivenöl', quantity: 3, unit: 'tbsp' },
	{ id: 'milk', name: 'milk', quantity: 0.5, unit: 'L' },
	{ id: 'salt', name: 'Salz', quantity: null, unit: null }
];

/** What cook mode does: read the step against the scaled rows, then scale its amounts. */
function cook(text: string, factor: number, uses: StepUse[] | null = null): string {
	const scaled = scaleIngredients(rows, factor);
	const read = readStep({ text, uses: scaleStepUses(uses, factor) }, scaled);
	return scaleStepAmounts(read.segments, factor, scaled, uses !== null)
		.map((segment) => (segment.scaledFrom ? `[${segment.text}]` : segment.text))
		.join('');
}

describe('scaleStepAmounts — what changes', () => {
	it('scales a count and a weight written right before their ingredient', () => {
		assert.equal(cook('2 Tomaten würfeln.', 2), '[4] Tomaten würfeln.');
		assert.equal(cook('200 g Mehl unterrühren.', 2), '[400 g] Mehl unterrühren.');
		assert.equal(cook('Add 200g Mehl.', 0.5), 'Add [100g] Mehl.');
	});

	it('keeps the unit as written and a decimal comma as a comma', () => {
		assert.equal(cook('2 EL Olivenöl erhitzen.', 1.5), '[3 EL] Olivenöl erhitzen.');
		assert.equal(cook('0,25 l milk dazu.', 2), '[0,5 l] milk dazu.');
		assert.equal(cook('Add ½ L milk.', 2), 'Add [1 L] milk.');
	});

	it('scales a pinned share that matches what the step was pinned with', () => {
		const share: StepUse[] = [{ ingredientId: 'oil', quantity: 1 }];
		assert.equal(cook('1 EL Olivenöl in die Pfanne.', 2, share), '[2 EL] Olivenöl in die Pfanne.');
	});

	it('leaves the recipe as written at the servings it was written for', () => {
		assert.equal(cook('2 Tomaten würfeln.', 1), '2 Tomaten würfeln.');
	});
});

describe('scaleStepAmounts — what never changes', () => {
	it('numbers that aren’t an ingredient’s amount', () => {
		assert.equal(cook('Bei 180 °C backen.', 2), 'Bei 180 °C backen.');
		assert.equal(cook('In 2 cm Würfel schneiden.', 2), 'In 2 cm Würfel schneiden.');
		assert.equal(cook('10 Minuten köcheln.', 2), '10 Minuten köcheln.');
		assert.equal(cook('In 4 Portionen teilen.', 2), 'In 4 Portionen teilen.');
		assert.equal(cook('Tomaten 2 Minuten anbraten.', 2), 'Tomaten 2 Minuten anbraten.');
	});

	it('an amount in a unit that isn’t the row’s', () => {
		assert.equal(cook('2 TL Mehl darüberstäuben.', 2), '2 TL Mehl darüberstäuben.');
		assert.equal(cook('2 g Tomaten?', 2), '2 g Tomaten?');
	});

	it('an amount the recipe doesn’t vouch for', () => {
		// More than the whole row.
		assert.equal(cook('900 g Mehl.', 2), '900 g Mehl.');
		// A row with no amount to compare against.
		assert.equal(cook('2 Salz.', 2), '2 Salz.');
		// Pinned with a share the text disagrees with (neither the share nor the total).
		const share: StepUse[] = [{ ingredientId: 'oil', quantity: 1 }];
		assert.equal(cook('2 EL Olivenöl.', 2, share), '2 EL Olivenöl.');
		// …while the whole row, named on a pinned step, still scales.
		assert.equal(cook('3 EL Olivenöl.', 2, share), '[6 EL] Olivenöl.');
	});

	it('the middle of a bigger number, or one that could be either of two', () => {
		assert.equal(cook('Mit 1 1/2 Tomaten.', 2), 'Mit 1 1/2 Tomaten.');
		// German thousands, or English one-point-two? Not guessed.
		assert.equal(cook('Mit 1.200 Tomaten.', 2), 'Mit 1.200 Tomaten.');
		assert.equal(cook('1,250 g Mehl.', 2), '1,250 g Mehl.');
	});

	it('keeps a fraction a fraction', () => {
		assert.equal(cook('¼ L milk.', 2), '[½ L] milk.');
	});
});
