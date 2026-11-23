/**
 * `npm test` — Vitest (→ docs/TESTING.md; born as `node --test` in plan 08).
 *
 * `parseIngredient` and `formatIngredient` have always claimed to be inverses,
 * and the recipe form leaned on that once a save: read the stored row out as a
 * line, take the line back in unchanged. The ingredient sheet [3c] now runs that
 * round trip on **every edit**, and it runs it through the *labels* — it writes
 * "2 EL Öl" and the server reads the "EL" back through `UNIT_ALIASES`
 * (→ DECISIONS #97, #101). That coupling is what this file guards: a ninth unit,
 * or a German label nobody aliased, would silently store the wrong thing.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	formatAmount,
	formatIngredient,
	parseIngredient,
	parseQuantity,
	RECIPE_UNITS,
	scaleIngredients,
	servingsFactor
} from './ingredients.ts';
import { measureKey } from './amounts.ts';

describe('formatIngredient → parseIngredient', () => {
	it('reads every label the app shows back to the unit it labels', () => {
		// The two `UNITS` maps at the top of en.ts and de.ts, copied rather than
		// imported (a habit from the `node --test` days that still keeps this pure). A ninth unit added
		// without an alias still fails here — the copy misses the label,
		// `unitLabel` falls back to the canonical spelling, which has no alias.
		const en = {
			pcs: 'pcs',
			g: 'g',
			kg: 'kg',
			ml: 'ml',
			L: 'L',
			pack: 'pack',
			tbsp: 'tbsp',
			tsp: 'tsp'
		};
		const de = {
			pcs: 'Stk.',
			g: 'g',
			kg: 'kg',
			ml: 'ml',
			L: 'l',
			pack: 'Pck.',
			tbsp: 'EL',
			tsp: 'TL'
		};

		for (const labels of [en, de]) {
			for (const unit of RECIPE_UNITS) {
				const line = formatIngredient({ quantity: 2, unit, name: 'Öl' }, labels);
				assert.deepEqual(parseIngredient(line), { quantity: 2, unit, name: 'Öl' }, line);
			}
		}
	});

	it('keeps a fraction as the glyph it was typed as', () => {
		assert.equal(formatIngredient({ quantity: 0.5, unit: 'tsp', name: 'salt' }, {}), '½ tsp salt');
	});

	it('reads the amounts the sheet now lets you type', () => {
		const written = [
			['1 1/2', 1.5],
			['1,5', 1.5],
			['½', 0.5],
			['0.5', 0.5]
		] as const;

		for (const [text, quantity] of written) {
			assert.equal(parseIngredient(`${text} L milk`)?.quantity, quantity, text);
		}
	});

	it('drops a unit that measures nothing', () => {
		assert.deepEqual(parseIngredient('g flour'), { quantity: null, unit: null, name: 'g flour' });
	});
});

describe('parseIngredient — ranges', () => {
	it('keeps the first value of a range, and the unit after it', () => {
		assert.deepEqual(parseIngredient('2-3 EL Öl'), { quantity: 2, unit: 'tbsp', name: 'Öl' });
		// "Zehen" is a counting word (plan 42): it belongs to the amount.
		assert.deepEqual(parseIngredient('1–2 Zehen Knoblauch'), {
			quantity: 1,
			unit: 'Zehen',
			name: 'Knoblauch'
		});
		assert.deepEqual(parseIngredient('100 bis 150 g Zucker'), {
			quantity: 100,
			unit: 'g',
			name: 'Zucker'
		});
		assert.deepEqual(parseIngredient('½-1 TL Salz'), { quantity: 0.5, unit: 'tsp', name: 'Salz' });
	});

	it('leaves a hyphen that starts a word alone', () => {
		assert.deepEqual(parseIngredient('2 -Minuten-Eier'), {
			quantity: 2,
			unit: null,
			name: '-Minuten-Eier'
		});
	});
});

/**
 * The contract of the recipe line (→ plan 42). `[typed, quantity, unit, name]`,
 * `N` = null. The lines are real ones, from the probe of 41 recipe pages on
 * 2026-11-23 (→ plan 44) and from what a household types. A case that turns out
 * to be wrong is changed in the plan, with a line in DECISIONS, not silently
 * here.
 */
const N = null;
const CONTRACT: [string, number | null, string | null, string][] = [
	// The eight units, spaced, fused, spelled out, in either language
	['400 g Nudeln', 400, 'g', 'Nudeln'],
	['500g Mehl', 500, 'g', 'Mehl'],
	['750g beef mince', 750, 'g', 'beef mince'],
	['130 Gramm Weizenmehl', 130, 'g', 'Weizenmehl'],
	['1,5 kg Erdäpfel', 1.5, 'kg', 'Erdäpfel'],
	['3,5 kg Gans', 3.5, 'kg', 'Gans'],
	['200ml Sahne', 200, 'ml', 'Sahne'],
	['250ml coconut milk', 250, 'ml', 'coconut milk'],
	['12.5 ml Sojasoße', 12.5, 'ml', 'Sojasoße'],
	['0.5 Liter Milch', 0.5, 'L', 'Milch'],
	['0,5 l Milch', 0.5, 'L', 'Milch'],
	['1/8 l Orangensaft', 0.13, 'L', 'Orangensaft'],
	['2 Stück Äpfel', 2, 'pcs', 'Äpfel'],
	['2 Stk. Eier', 2, 'pcs', 'Eier'],
	['4 Stk Kalbsschnitzel (à 160 g)', 4, 'pcs', 'Kalbsschnitzel (à 160 g)'],
	['1 Pck. Vanillezucker', 1, 'pack', 'Vanillezucker'],
	['1 Packung Blätterteig', 1, 'pack', 'Blätterteig'],
	['1 Pkg. Faschiertes', 1, 'pack', 'Faschiertes'],
	['1 Päckchen Backpulver', 1, 'pack', 'Backpulver'],
	['2 EL Olivenöl', 2, 'tbsp', 'Olivenöl'],
	['2 El Olivenöl', 2, 'tbsp', 'Olivenöl'],
	['2 Esslöffel Öl', 2, 'tbsp', 'Öl'],
	['3 Tbsp. olive oil', 3, 'tbsp', 'olive oil'],
	['2 tablespoons butter', 2, 'tbsp', 'butter'],
	['1 TL Backpulver', 1, 'tsp', 'Backpulver'],
	['1 Tl Zucker', 1, 'tsp', 'Zucker'],
	['1 1/2 Teelöffel Zimt', 1.5, 'tsp', 'Zimt'],
	['1/2 Teelöffel Salz', 0.5, 'tsp', 'Salz'],
	['½ TL Zimt', 0.5, 'tsp', 'Zimt'],
	['1 ½ TL Salz', 1.5, 'tsp', 'Salz'],
	['1½ tsp salt', 1.5, 'tsp', 'salt'],
	['0.25 TL Muskat', 0.25, 'tsp', 'Muskat'],
	['1 and 1/2 tsp vanilla', 1.5, 'tsp', 'vanilla'],
	['1 TL, gestr. Backpulver', 1, 'tsp', 'gestr. Backpulver'],
	['1 EL gehäuft Mehl', 1, 'tbsp', 'gehäuft Mehl'],
	// The Deka, as on a list
	['20 dag Extrawurst', 200, 'g', 'Extrawurst'],
	['15 dkg Butter', 150, 'g', 'Butter'],
	// Rough amounts and ranges: the first value stands
	['ca. 200 g Butter', 200, 'g', 'Butter'],
	['etwa 2 EL Wasser', 2, 'tbsp', 'Wasser'],
	['about 2 tbsp water', 2, 'tbsp', 'water'],
	['1 - 2 EL Olivenöl', 1, 'tbsp', 'Olivenöl'],
	['2-3 EL Öl', 2, 'tbsp', 'Öl'],
	['2 bis 3 EL Öl', 2, 'tbsp', 'Öl'],
	['2 to 3 tablespoons oil', 2, 'tbsp', 'oil'],
	['200-250g Mehl', 200, 'g', 'Mehl'],
	['8-12 Stück Lasagneplatten', 8, 'pcs', 'Lasagneplatten'],
	['2-3 Zwiebeln (ca. 150 g)', 2, N, 'Zwiebeln (ca. 150 g)'],
	// An amount at the end of the line
	['Mehl 500g', 500, 'g', 'Mehl'],
	['Mehl 500 g', 500, 'g', 'Mehl'],
	['Milch 2l', 2, 'L', 'Milch'],
	['Salz, 1 TL', 1, 'tsp', 'Salz'],
	['Extrawurst 20 dag', 200, 'g', 'Extrawurst'],
	// Counting words: kept as written, the name stays clean
	['2 Zehen Knoblauch', 2, 'Zehen', 'Knoblauch'],
	['1 Zehe Knoblauch', 1, 'Zehe', 'Knoblauch'],
	['2 Zehe/n Knoblauch', 2, 'Zehen', 'Knoblauch'],
	['1 Bund Petersilie (oder TK)', 1, 'Bund', 'Petersilie (oder TK)'],
	['¼ Bund Schnittlauch', 0.25, 'Bund', 'Schnittlauch'],
	['1 Dose Tomaten, geschälte (800 g)', 1, 'Dose', 'Tomaten, geschälte (800 g)'],
	['2 Dosen Kichererbsen', 2, 'Dosen', 'Kichererbsen'],
	['1 Becher Sauerrahm', 1, 'Becher', 'Sauerrahm'],
	['1 Glas Preiselbeeren', 1, 'Glas', 'Preiselbeeren'],
	['1 Prise Salz', 1, 'Prise', 'Salz'],
	['4 Prise Salz', 4, 'Prise', 'Salz'],
	['1 Msp. Muskatnuss, frisch geriebene', 1, 'Msp.', 'Muskatnuss, frisch geriebene'],
	['1 Schuss Essig', 1, 'Schuss', 'Essig'],
	['4 Scheiben Toastbrot', 4, 'Scheiben', 'Toastbrot'],
	['2 Stangen Lauch', 2, 'Stangen', 'Lauch'],
	['0.5 Stange Porree', 0.5, 'Stange', 'Porree'],
	['2 Zweige Rosmarin', 2, 'Zweige', 'Rosmarin'],
	['2 Blatt Gelatine', 2, 'Blatt', 'Gelatine'],
	['1 Würfel Hefe', 1, 'Würfel', 'Hefe'],
	['3 Handvoll Rucola', 3, 'Handvoll', 'Rucola'],
	['2 cloves garlic, minced', 2, 'cloves', 'garlic, minced'],
	['2 cloves of garlic', 2, 'cloves', 'garlic'],
	['1 can chickpeas', 1, 'can', 'chickpeas'],
	['1 bunch parsley', 1, 'bunch', 'parsley'],
	['1 pinch salt', 1, 'pinch', 'salt'],
	['2 sprigs thyme', 2, 'sprigs', 'thyme'],
	['1 stick butter', 1, 'stick', 'butter'],
	// A plural the site left open is settled by the amount
	['1 Zwiebel(n)', 1, N, 'Zwiebel'],
	['2 Zwiebel(n)', 2, N, 'Zwiebeln'],
	['2 Knoblauchzehe(n)', 2, N, 'Knoblauchzehen'],
	['1 Ei(er)', 1, N, 'Ei'],
	['3 Ei(er)', 3, N, 'Eier'],
	['300 g Lasagneplatte(n)', 300, 'g', 'Lasagneplatten'],
	['Tomate(n)', N, N, 'Tomate'],
	// Counts with no unit
	['3 Eier (Größe M)', 3, N, 'Eier (Größe M)'],
	['1 Ei (Größe M)', 1, N, 'Ei (Größe M)'],
	['2 große Zwiebeln, fein gehackt', 2, N, 'große Zwiebeln, fein gehackt'],
	['1 kleine rote Zwiebel', 1, N, 'kleine rote Zwiebel'],
	['1 Karotte, in Scheiben geschnitten', 1, N, 'Karotte, in Scheiben geschnitten'],
	['1/2 Zitrone, Saft davon', 0.5, N, 'Zitrone, Saft davon'],
	['1 x Backpulver', 1, N, 'Backpulver'],
	['3x Eier', 3, N, 'Eier'],
	['4 x 150g Hühnerbrust', 4, N, '150g Hühnerbrust'],
	['12 Marzipan-Karotten', 12, N, 'Marzipan-Karotten'],
	// No amount to read: the line is the name
	['Salz', N, N, 'Salz'],
	['Salz und Pfeffer', N, N, 'Salz und Pfeffer'],
	['etwas Rotwein', N, N, 'etwas Rotwein'],
	['nach Geschmack Salz', N, N, 'nach Geschmack Salz'],
	['Fett für die Form', N, N, 'Fett für die Form'],
	['n. B. Salz', N, N, 'n. B. Salz'],
	['A few sprigs thyme', N, N, 'A few sprigs thyme'],
	['7up', N, N, '7up'],
	['1. Mai Kerzen', N, N, '1. Mai Kerzen'],
	['Mehl Type 405', N, N, 'Mehl Type 405'],
	// Not read, on purpose: cups, oz and lb (the AI import converts them),
	// two measures, an adjective before the counting word
	['2 cups flour', 2, N, 'cups flour'],
	['1 lb ground beef', 1, N, 'lb ground beef'],
	['1 kg / 2 lb beef mince', 1, 'kg', '/ 2 lb beef mince'],
	['1 kleine Dose Mais', 1, N, 'kleine Dose Mais'],
	['1 (14 oz) can tomatoes', 1, N, '(14 oz) can tomatoes']
];

describe('parseIngredient — the contract (plan 42)', () => {
	it('has at least the 80 lines the plan asks for', () => {
		assert.ok(CONTRACT.length >= 80, `${CONTRACT.length} lines`);
	});

	for (const [typed, quantity, unit, name] of CONTRACT) {
		it(`reads "${typed}"`, () => {
			assert.deepEqual(parseIngredient(typed), { quantity, unit, name });
		});
	}

	it('reads every line back the same way once it has been written out', () => {
		// German labels, as a German household's editor writes them.
		const labels = { pcs: 'Stk.', pack: 'Pkg.', tbsp: 'EL', tsp: 'TL', L: 'l' };
		for (const [typed] of CONTRACT) {
			const row = parseIngredient(typed);
			assert.ok(row);
			for (const written of [formatIngredient(row), formatIngredient(row, labels)]) {
				// A counting word is written in the number that fits (plan 46: "4 Prisen"),
				// so it reads back as the same word in that number.
				const again = parseIngredient(written);
				assert.deepEqual(
					{ ...again, unit: measureKey(again?.unit) ?? again?.unit },
					{ ...row, unit: measureKey(row.unit) ?? row.unit },
					`${typed} → ${written}`
				);
			}
		}
	});
});

describe('formatAmount with a counting word (plan 46)', () => {
	it('writes the word in the number that fits the amount', () => {
		assert.equal(formatAmount(1, 'Zehen'), '1 Zehe');
		assert.equal(formatAmount(2, 'Zehe'), '2 Zehen');
		assert.equal(formatAmount(0.5, 'Dose'), '½ Dose');
		assert.equal(formatAmount(3, 'clove'), '3 cloves');
	});

	it('leaves a household’s own word and a labelled unit as they are', () => {
		assert.equal(formatAmount(2, 'Kugel'), '2 Kugel');
		assert.equal(formatAmount(2, 'tbsp', { tbsp: 'EL' }), '2 EL');
	});
});

describe('parseQuantity', () => {
	it('takes every spelling a recipe writes an amount in', () => {
		assert.equal(parseQuantity('400'), 400);
		assert.equal(parseQuantity('1.5'), 1.5);
		assert.equal(parseQuantity('1,5'), 1.5);
		assert.equal(parseQuantity('½'), 0.5);
		assert.equal(parseQuantity('1½'), 1.5);
		assert.equal(parseQuantity('1 1/2'), 1.5);
		assert.equal(parseQuantity(' 3/4 '), 0.75);
	});

	it('is nothing at all when the field is empty or not a number', () => {
		assert.equal(parseQuantity(''), null);
		assert.equal(parseQuantity('   '), null);
		assert.equal(parseQuantity('two'), null);
		assert.equal(parseQuantity('0'), null);
	});

	it('refuses a number with anything after it', () => {
		// The unit is the ingredient row's, not this field's — "2 tsp" here would
		// otherwise be silently kept as a bare 2.
		assert.equal(parseQuantity('2 tsp'), null);
		assert.equal(parseQuantity('2x'), null);
	});
});

describe('servingsFactor', () => {
	it('is the ratio of what you are cooking to what it was written for', () => {
		assert.equal(servingsFactor(4, 6), 1.5);
		assert.equal(servingsFactor(4, 2), 0.5);
		assert.equal(servingsFactor(4, 4), 1);
	});

	it('is 1 when there is nothing to scale from', () => {
		// Half of an unknown is unknown — the screens hide the control instead.
		assert.equal(servingsFactor(null, 6), 1);
		assert.equal(servingsFactor(0, 6), 1);
	});

	it('is 1 for a number of people nobody can cook for', () => {
		assert.equal(servingsFactor(4, 0), 1);
		assert.equal(servingsFactor(4, -2), 1);
		assert.equal(servingsFactor(4, Number.NaN), 1);
	});
});

describe('scaleIngredients', () => {
	const RECIPE = [
		{ name: 'Pasta', quantity: 400, unit: 'g' },
		{ name: 'Cream', quantity: 200, unit: 'ml' },
		{ name: 'Salt', quantity: null, unit: null }
	];

	it('writes the amounts out for the new number of people', () => {
		assert.deepEqual(scaleIngredients(RECIPE, servingsFactor(4, 6)), [
			{ name: 'Pasta', quantity: 600, unit: 'g' },
			{ name: 'Cream', quantity: 300, unit: 'ml' },
			// No number in it to multiply — "Salt" is still "Salt" for six.
			{ name: 'Salt', quantity: null, unit: null }
		]);
	});

	it('leaves names and units alone', () => {
		const [pasta] = scaleIngredients(RECIPE, 0.5);
		assert.equal(pasta.name, 'Pasta');
		assert.equal(pasta.unit, 'g');
		assert.equal(pasta.quantity, 200);
	});

	it('hands back the same rows when there is nothing to do', () => {
		assert.equal(scaleIngredients(RECIPE, 1), RECIPE);
	});

	it('keeps the fraction where the fraction is the amount', () => {
		// Two thirds of an egg, half a teaspoon — these are instructions.
		const [egg] = scaleIngredients([{ quantity: 1, unit: 'pcs' }], servingsFactor(3, 2));
		assert.equal(egg.quantity, 0.67);

		const [tsp] = scaleIngredients([{ quantity: 1, unit: 'tsp' }], servingsFactor(4, 6));
		assert.equal(tsp.quantity, 1.5);
	});

	it('rounds a weight to something a scale can weigh', () => {
		// "187½ g mushrooms" is precision no kitchen has; 188 g is what you'd do.
		const [mushrooms] = scaleIngredients([{ quantity: 250, unit: 'g' }], servingsFactor(4, 3));
		assert.equal(mushrooms.quantity, 188);

		const [butter] = scaleIngredients([{ quantity: 30, unit: 'g' }], servingsFactor(4, 3));
		assert.equal(butter.quantity, 23);
	});

	it('never rounds an amount away to nothing', () => {
		// 0.0025 would store as null, and a row that loses its amount reads as
		// "some", which is a different instruction than "a very little".
		const [pinch] = scaleIngredients([{ quantity: 0.01, unit: 'tsp' }], 0.25);
		assert.equal(pinch.quantity, 0.01);
	});

	it('does not invent an amount for a line that never had one', () => {
		const [salt] = scaleIngredients([{ quantity: null, unit: null }], 4);
		assert.equal(salt.quantity, null);
	});
});
