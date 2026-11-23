/**
 * The import without a model (→ plan 44, `rule-draft.ts`): every corpus page
 * with a card becomes a draft whose names carry no comma and no bracket, whose
 * parts are the readers', and whose counting words are read as units.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { readFetchedPage } from '../server/recipe-import';
import { parseIngredient } from './ingredients';
import { ruleDraft, ruleRow, splitNote } from './rule-draft';

describe('splitNote', () => {
	it('takes what follows the first comma as the note', () => {
		assert.deepEqual(splitNote('Lasagneplatten, ungekocht (Menge je nach Form)'), {
			name: 'Lasagneplatten',
			note: 'ungekocht (Menge je nach Form)'
		});
	});

	it('takes what stands in brackets, one note per bracket', () => {
		assert.deepEqual(splitNote('Stangensellerie (geputzt) (ca. 50 g)'), {
			name: 'Stangensellerie',
			note: 'geputzt; ca. 50 g'
		});
	});

	it('looks for the comma outside brackets', () => {
		assert.deepEqual(splitNote('Tomaten (stückig, aus der Dose)'), {
			name: 'Tomaten',
			note: 'stückig, aus der Dose'
		});
	});

	it('leaves a plain name alone, and a name that would be left empty whole', () => {
		assert.deepEqual(splitNote('Salz'), { name: 'Salz', note: null });
		assert.deepEqual(splitNote('(optional)'), { name: '(optional)', note: null });
	});
});

describe('ruleRow', () => {
	it('reads the amount, the counting word, the name and the note', () => {
		assert.deepEqual(ruleRow('100 g Speck (geräuchert, durchwachsen)'), {
			quantity: 100,
			unit: 'g',
			name: 'Speck',
			note: 'geräuchert, durchwachsen'
		});
		assert.deepEqual(ruleRow('2 Zehe/n Knoblauch'), {
			quantity: 2,
			unit: 'Zehen',
			name: 'Knoblauch',
			note: null
		});
	});

	it('reads the household’s own unit words, and leaves the rest in the name', () => {
		assert.deepEqual(ruleRow('2 Ringe Fleischwurst'), {
			quantity: 2,
			unit: null,
			name: 'Ringe Fleischwurst',
			note: null
		});
		assert.deepEqual(ruleRow('2 Ringe Fleischwurst', new Set(['ring'])), {
			quantity: 2,
			unit: 'Ringe',
			name: 'Fleischwurst',
			note: null
		});
	});
});

describe('ruleDraft on every corpus page with a card', () => {
	const fixtures = readdirSync('src/lib/utils/fixtures').map((file) => file.replace(/\.html$/, ''));

	for (const fixture of fixtures) {
		const html = readFileSync(`src/lib/utils/fixtures/${fixture}.html`, 'utf8');
		const { card } = readFetchedPage({ html, finalUrl: 'https://example.com/' });
		if (!card) continue;

		it(fixture, () => {
			const draft = ruleDraft(card, { labels: { tbsp: 'EL', tsp: 'TL' } });
			assert.equal(draft.ingredientLines.length, Math.min(card.ingredientLines.length, 60));
			// Names carry no comma and no bracket: the rest went to the note.
			draft.ingredientLines.forEach((line) => {
				const name = parseIngredient(line)?.name ?? '';
				// A whole-group blob (zuckerjagdwurst) or an empty-after-split name stays whole.
				if (name.length < 60 && !name.startsWith('(')) {
					assert.doesNotMatch(name, /[,()]/, `${fixture}: ${line}`);
				}
			});
			// The parts are the readers'.
			assert.deepEqual(
				draft.ingredientDetails?.map((one) => one?.section ?? null),
				card.ingredientSections.slice(0, 60)
			);
			// A long step may become several (split at sentence ends): the parts, in order, stay.
			const runs = (list: (string | null | undefined)[]) =>
				list.filter((one, at) => at === 0 || list[at - 1] !== one);
			assert.deepEqual(
				runs(draft.steps.map((step) => step.section)),
				runs(card.stepSections.slice(0, 40))
			);
			assert.ok(draft.steps.every((step) => step.text.length <= 600));
			// Without AI: no links, and the draft says so.
			assert.ok(draft.steps.every((step) => step.uses === null));
			assert.equal(draft.checks?.[0]?.kind, 'no-ai');
		});
	}

	it('reads counting words as units (chefkoch: Bund, Zehen)', () => {
		const html = readFileSync('src/lib/utils/fixtures/chefkoch-lasagne.html', 'utf8');
		const { card } = readFetchedPage({ html, finalUrl: 'https://example.com/' });
		const draft = ruleDraft(card!);
		assert.equal(draft.ingredientLines[0], '1 Bund Suppengrün');
		assert.equal(draft.ingredientLines[2], '2 Zehen Knoblauch');
		assert.equal(draft.ingredientLines[3], '100 g Speck');
		assert.equal(draft.ingredientDetails?.[3]?.note, 'geräuchert, durchwachsen');
	});
});
