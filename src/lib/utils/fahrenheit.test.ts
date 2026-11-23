/**
 * Fahrenheit converted by code in an imported step (→ plan 44, `fahrenheit.ts`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { draftInCelsius, withCelsius } from './fahrenheit.ts';

const text = (step: string) => withCelsius(step).text;

describe('withCelsius', () => {
	it('writes Celsius in front and keeps the page’s value in brackets, to the nearest 5', () => {
		assert.equal(text('Preheat oven to 350°F.'), 'Preheat oven to 175 °C (350°F).');
		assert.equal(text('Bake at 350 °F for 20 minutes.'), 'Bake at 175 °C (350 °F) for 20 minutes.');
		assert.equal(text('Heat to 400° F.'), 'Heat to 205 °C (400° F).');
		assert.equal(text('Roast at 425 degrees F.'), 'Roast at 220 °C (425 degrees F).');
		assert.equal(
			text('Set the oven to 325 degrees Fahrenheit.'),
			'Set the oven to 165 °C (325 degrees Fahrenheit).'
		);
	});

	it('converts a range, both ends, written with a dash or a word', () => {
		assert.equal(text('Bake at 350-375°F.'), 'Bake at 175–190 °C (350-375°F).');
		assert.equal(
			text('Bake at 350 to 375 degrees F.'),
			'Bake at 175–190 °C (350 to 375 degrees F).'
		);
	});

	it('leaves a °F with its °C after it, and converts one with an unrelated °C before it', () => {
		for (const step of ['Preheat oven to 350°F (175°C).', 'Preheat to 350°F/180°C.']) {
			assert.deepEqual(withCelsius(step), { text: step, changed: false }, step);
		}
		assert.equal(text('Bake at 180°C, then at 400°F.'), 'Bake at 180°C, then at 205 °C (400°F).');
	});

	it('leaves a step alone when Celsius would push it past what the editor holds', () => {
		const long = `${'Rühren. '.repeat(73)}Bake at 350°F.`;
		assert.ok(long.length <= 600);
		const draft = { steps: [{ text: long }] };
		assert.equal(draftInCelsius(draft), draft);
	});

	it('says whether it changed anything', () => {
		assert.equal(withCelsius('Preheat to 350°F.').changed, true);
		assert.equal(withCelsius('Preheat to 180 °C.').changed, false);
	});

	it('leaves a bare "350 F", anything in °C, and a °F the page already gave beside °C', () => {
		for (const step of [
			'Bake at 350 F.',
			'Bei 180 °C backen.',
			'Preheat oven to 180°C/350°F.',
			'Bake at 175 °C (350 °F).',
			'Use 2 F-shaped cutters.'
		]) {
			assert.deepEqual(withCelsius(step), { text: step, changed: false }, step);
		}
	});

	it('converts a draft’s steps and adds a quiet item per changed step', () => {
		const draft = draftInCelsius({
			steps: [{ text: 'Mix.' }, { text: 'Bake at 350°F.' }],
			checks: [{ kind: 'servings' as const, level: 'check' as const, at: 'recipe' as const }]
		});
		assert.equal(draft.steps[1].text, 'Bake at 175 °C (350°F).');
		assert.deepEqual(draft.checks?.at(-1), { kind: 'converted', level: 'info', at: { step: 1 } });
		const untouched = { steps: [{ text: 'Bei 180 °C backen.' }] };
		assert.equal(draftInCelsius(untouched), untouched);
	});

	it('is stable: a converted step converts to itself', () => {
		const once = text('Preheat to 350°F.');
		assert.equal(text(once), once);
	});
});
