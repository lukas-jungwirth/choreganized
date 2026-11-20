/**
 * Where a quick add lands, and what "2 l milk" means (plan 36, SPEC §3.1).
 * Both run in the browser on every keystroke, so they are pinned here rather
 * than by typing each case into the field.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	foldedCookie,
	listIcon,
	listTarget,
	parseQuickAdd,
	quickAddName,
	readFolded,
	type KnownName
} from './lists.ts';
import { suggestionKey as key } from './shopping.ts';

const LISTS = [
	{ id: 'grocery' },
	{ id: 'drugstore' },
	{ id: 'hardware' },
	{ id: 'packing', kind: 'checklist' as const }
];
const KNOWN: KnownName[] = [
	{ name: 'Shampoo', storeId: 'drugstore' },
	// Went to a list that has since become a checklist.
	{ name: 'Sunscreen', storeId: 'packing' },
	{ name: 'Milk', storeId: 'grocery' },
	{ name: 'Screws', storeId: 'deleted' },
	{ name: 'Candles', storeId: null }
];

function target(typed: string, picked: string | null = null) {
	return listTarget({ typed, known: KNOWN, lists: LISTS, picked, fallback: 'grocery' });
}

describe('listTarget', () => {
	it('sends a known name to the list it went to last, and says so', () => {
		assert.deepEqual(target('Shampoo'), { storeId: 'drugstore', remembered: 'Shampoo' });
		// However it is typed, and with an amount in front.
		assert.deepEqual(target('  shampoo '), { storeId: 'drugstore', remembered: 'Shampoo' });
		assert.deepEqual(target('2 shampoo'), { storeId: 'drugstore', remembered: 'Shampoo' });
	});

	it('leaves an unknown name on the list the icon shows', () => {
		assert.deepEqual(target('Sham'), { storeId: 'grocery', remembered: null });
		assert.deepEqual(target(''), { storeId: 'grocery', remembered: null });
	});

	it('has nothing to say when the known list is the one already shown', () => {
		assert.deepEqual(target('Milk'), { storeId: 'grocery', remembered: null });
	});

	it('ignores a remembered list that no longer exists, or "Other"', () => {
		assert.deepEqual(target('Screws'), { storeId: 'grocery', remembered: null });
		assert.deepEqual(target('Candles'), { storeId: 'grocery', remembered: null });
	});

	it('looks a line the household uses whole up whole, amount or not', () => {
		const known: KnownName[] = [
			{ name: 'Windeln', storeId: 'grocery' },
			{ name: 'Windeln 4', storeId: 'drugstore' }
		];
		const at = (typed: string) =>
			listTarget({ typed, known, lists: LISTS, picked: null, fallback: 'hardware' }).storeId;
		assert.equal(at('Windeln 4'), 'drugstore');
		assert.equal(at('Windeln 4 x2'), 'drugstore');
		assert.equal(at('Windeln x2'), 'grocery');
	});

	it('never moves the icon to a checklist by itself, but a pick may go there', () => {
		assert.deepEqual(target('Sunscreen'), { storeId: 'grocery', remembered: null });
		assert.deepEqual(target('Sunscreen', 'packing'), { storeId: 'packing', remembered: null });
	});

	it('a list picked from the menu wins over what is remembered', () => {
		assert.deepEqual(target('Shampoo', 'hardware'), { storeId: 'hardware', remembered: null });
		assert.deepEqual(target('Milk', 'hardware'), { storeId: 'hardware', remembered: null });
	});

	it('forgets a pick that points at a list deleted meanwhile', () => {
		assert.deepEqual(target('Nails', 'gone'), { storeId: 'grocery', remembered: null });
	});

	it('resets once the pick is gone (the screen was left)', () => {
		// The page holds the pick in component state; leaving the screen drops it,
		// which is the same call with `picked: null`.
		assert.equal(target('Nails', 'hardware').storeId, 'hardware');
		assert.equal(target('Nails').storeId, 'grocery');
	});
});

describe('parseQuickAdd', () => {
	it('reads an amount and a unit typed in the same line', () => {
		assert.deepEqual(parseQuickAdd('2 l milk'), { name: 'milk', quantity: 2, unit: 'L' });
		assert.deepEqual(parseQuickAdd('500g Mehl'), { name: 'Mehl', quantity: 500, unit: 'g' });
		assert.deepEqual(parseQuickAdd('6 eggs'), { name: 'eggs', quantity: 6, unit: null });
		assert.deepEqual(parseQuickAdd('1,5 kg Äpfel'), { name: 'Äpfel', quantity: 1.5, unit: 'kg' });
		assert.deepEqual(parseQuickAdd('2 Pck. Butter'), { name: 'Butter', quantity: 2, unit: 'pack' });
	});

	it('keeps a name that only starts with a number whole', () => {
		assert.deepEqual(parseQuickAdd('7up'), { name: '7up', quantity: null, unit: null });
		assert.deepEqual(parseQuickAdd('4-Kornbrot'), {
			name: '4-Kornbrot',
			quantity: null,
			unit: null
		});
		assert.deepEqual(parseQuickAdd('Milk'), { name: 'Milk', quantity: null, unit: null });
	});

	it('keeps a line with no name, or an absurd amount, whole', () => {
		assert.deepEqual(parseQuickAdd('2'), { name: '2', quantity: null, unit: null });
		assert.deepEqual(parseQuickAdd('5000 eggs'), { name: '5000 eggs', quantity: null, unit: null });
		// An amount and a unit with nothing to measure is not a row called "kg".
		assert.deepEqual(parseQuickAdd('2 kg'), { name: '2 kg', quantity: null, unit: null });
		assert.deepEqual(parseQuickAdd('500g'), { name: '500g', quantity: null, unit: null });
		assert.deepEqual(parseQuickAdd('2 Stk.'), { name: '2 Stk.', quantity: null, unit: null });
	});
});

/* ── The contract (plan 37): copied from docs/plans/37-quick-add-amounts.md ── */

const N = null;
// [typed, name, quantity, unit]  ·  quantity null = stays a name, exactly as typed
const CASES = [
	// Lukas's own examples and their neighbours
	['Gurken x3', 'Gurken', 3, N],
	['Gurken X3', 'Gurken', 3, N],
	['Gurken ×3', 'Gurken', 3, N],
	['Gurken 3x', 'Gurken', 3, N],
	['Gurken x 3', 'Gurken', 3, N],
	['Gurken 3 x', 'Gurken', 3, N],
	['Gurken 3', 'Gurken', 3, N],
	['Gurken 3 Stk', 'Gurken', 3, 'pcs'],
	['Gurken 3 stk.', 'Gurken', 3, 'pcs'],
	['Gurken 3 Stück', 'Gurken', 3, 'pcs'],
	['Gurken 3stk', 'Gurken', 3, 'pcs'],
	['3 Gurken', 'Gurken', 3, N],
	['3x Gurken', 'Gurken', 3, N],
	['3 x Gurken', 'Gurken', 3, N],
	['x3 Gurken', 'Gurken', 3, N],
	['3 Stk Gurken', 'Gurken', 3, 'pcs'],
	['3 Stück Gurken', 'Gurken', 3, 'pcs'],
	// Weights and volumes, either end, fused or spaced
	['500g Faschiertes', 'Faschiertes', 500, 'g'],
	['500 g Faschiertes', 'Faschiertes', 500, 'g'],
	['Faschiertes 500g', 'Faschiertes', 500, 'g'],
	['Faschiertes 500 g', 'Faschiertes', 500, 'g'],
	['1,5 kg Erdäpfel', 'Erdäpfel', 1.5, 'kg'],
	['Erdäpfel 1,5 kg', 'Erdäpfel', 1.5, 'kg'],
	['Erdäpfel 1.5kg', 'Erdäpfel', 1.5, 'kg'],
	['2 l Milch', 'Milch', 2, 'L'],
	['2l Milch', 'Milch', 2, 'L'],
	['Milch 2l', 'Milch', 2, 'L'],
	['Milch 2 L', 'Milch', 2, 'L'],
	['Milch 2 Liter', 'Milch', 2, 'L'],
	['250 ml Schlagobers', 'Schlagobers', 250, 'ml'],
	['Schlagobers 250ml', 'Schlagobers', 250, 'ml'],
	['1/2 kg Butter', 'Butter', 0.5, 'kg'],
	['½ kg Butter', 'Butter', 0.5, 'kg'],
	['½ Brot', 'Brot', 0.5, N],
	// Austrian deli counter: Deka
	['20 dag Extrawurst', 'Extrawurst', 200, 'g'],
	['Extrawurst 20 dag', 'Extrawurst', 200, 'g'],
	['15dkg Käse', 'Käse', 150, 'g'],
	['10 Deka Schinken', 'Schinken', 100, 'g'],
	// Past the field's ceiling: grams and millilitres step up, counts stay a name
	['1000 g Mehl', 'Mehl', 1, 'kg'],
	['Mehl 1500g', 'Mehl', 1.5, 'kg'],
	['1500 ml Wasser', 'Wasser', 1.5, 'L'],
	['5000 eggs', '5000 eggs', N, N],
	// Packs
	['2 Pck. Butter', 'Butter', 2, 'pack'],
	['2 Packungen Nudeln', 'Nudeln', 2, 'pack'],
	['Nudeln 2 Pkg', 'Nudeln', 2, 'pack'],
	['Nudeln 2 Pkg.', 'Nudeln', 2, 'pack'],
	['2 pack butter', 'butter', 2, 'pack'],
	// A count plus a size in the name
	['6x Cola 0,5l', 'Cola 0,5l', 6, N],
	['Cola 0,5l 6x', 'Cola 0,5l', 6, N],
	['2 Cola 0,5l', 'Cola 0,5l', 2, N],
	['Milch 3,5% 2l', 'Milch 3,5%', 2, 'L'],
	['Batterien AA 4', 'Batterien AA', 4, N],
	['Batterien AA x4', 'Batterien AA', 4, N],
	['2 Dosen Tomaten', 'Dosen Tomaten', 2, N],
	['3 Flaschen Wein', 'Flaschen Wein', 3, N],
	// Punctuation and brackets
	['Gurken, 3 Stk', 'Gurken', 3, 'pcs'],
	['Gurken: 3', 'Gurken', 3, N],
	['Eier (10)', 'Eier', 10, N],
	['Mehl (1 kg)', 'Mehl', 1, 'kg'],
	['Bier (6x)', 'Bier', 6, N],
	['6 x 1,5l Wasser', '1,5l Wasser', 6, N],
	['M8 Muttern 10', 'M8 Muttern', 10, N],
	['Semmeln 12', 'Semmeln', 12, N],
	['Eier 10', 'Eier', 10, N],
	['Eier 100', 'Eier 100', N, N],
	['100 Eier', 'Eier', 100, N],
	['0 Gurken', '0 Gurken', N, N],
	['Gurken x0', 'Gurken x0', N, N],
	['Gurken 0', 'Gurken 0', N, N],
	['  3   Gurken ', 'Gurken', 3, N],
	['6 eggs', 'eggs', 6, N],
	['eggs x12', 'eggs', 12, N],
	// Names that only look like amounts: all stay exactly as typed
	['Gurken', 'Gurken', N, N],
	['7up', '7up', N, N],
	['4-Kornbrot', '4-Kornbrot', N, N],
	['WD-40', 'WD-40', N, N],
	['Tempo 10er', 'Tempo 10er', N, N],
	['LED bulbs (E27)', 'LED bulbs (E27)', N, N],
	['Schrauben 4x40', 'Schrauben 4x40', N, N],
	['Schrauben 4 x 40', 'Schrauben 4 x 40', N, N],
	['1. Mai Kerzen', '1. Mai Kerzen', N, N],
	['2 in 1 Shampoo', '2 in 1 Shampoo', N, N],
	['100 % Orangensaft', '100 % Orangensaft', N, N],
	['Milch 3,5%', 'Milch 3,5%', N, N],
	['Windeln Gr. 4', 'Windeln Gr. 4', N, N],
	['Windeln Größe 4', 'Windeln Größe 4', N, N],
	['Sonnencreme LSF 30', 'Sonnencreme LSF 30', N, N],
	['Kaffee Nr 3', 'Kaffee Nr 3', N, N],
	['Mehl 480', 'Mehl 480', N, N],
	['Mehl Typ 480', 'Mehl Typ 480', N, N],
	['Cola 0,5', 'Cola 0,5', N, N],
	['0,5 Cola', '0,5 Cola', N, N],
	['Papier A4', 'Papier A4', N, N],
	['Batterien CR2032', 'Batterien CR2032', N, N],
	['Öl 5W30', 'Öl 5W30', N, N],
	['Fotos 10 x 15', 'Fotos 10 x 15', N, N],
	['3 x 40 Schrauben', '3 x 40 Schrauben', N, N],
	['Wasser 6 x 1,5l', 'Wasser 6 x 1,5l', N, N],
	['Wasser 6 x 1,5 l', 'Wasser 6 x 1,5 l', N, N],
	['Joghurt 0%', 'Joghurt 0%', N, N],
	['Bier 6er', 'Bier 6er', N, N],
	['M8 Muttern', 'M8 Muttern', N, N],
	['Zwei Zitronen', 'Zwei Zitronen', N, N],
	['ein Brot', 'ein Brot', N, N],
	// Nothing to name: stays as typed
	['2', '2', N, N],
	['2 kg', '2 kg', N, N],
	['500g', '500g', N, N],
	['2 Stk.', '2 Stk.', N, N],
	['x3', 'x3', N, N],
	['3x', '3x', N, N],
	['', '', N, N],
	// Accepted misreads: the chip shows them, one tap fixes them, and the name is remembered
	['Windeln 4', 'Windeln', 4, N],
	['7 Tage Müsli', 'Tage Müsli', 7, N],
	['3 Wetter Taft', 'Wetter Taft', 3, N]
];
// The same lines once the household has used them as names: never split again.
// `KNOWN` in the plan; renamed here beside listTarget's own fixture.
const KNOWN_KEYS = new Set(['windeln 4', '7 tage müsli', '3 wetter taft', 'cola 6'].map(key));
const KNOWN_CASES = [
	['Windeln 4', 'Windeln 4', N, N],
	['7 Tage Müsli', '7 Tage Müsli', N, N],
	['windeln 4', 'windeln 4', N, N],
	['Cola 6', 'Cola 6', N, N],
	['Windeln 4 x2', 'Windeln 4', 2, N]
];

describe('parseQuickAdd: the contract (plan 37)', () => {
	it.each(CASES)('%j → %j, %j, %j', (typed, name, quantity, unit) => {
		assert.deepEqual(parseQuickAdd(typed as string), { name, quantity, unit });
	});

	it.each(KNOWN_CASES)('known: %j → %j, %j, %j', (typed, name, quantity, unit) => {
		assert.deepEqual(parseQuickAdd(typed as string, KNOWN_KEYS), { name, quantity, unit });
	});

	it('holds all 119 lines: 114 typed as they come, 5 against known names', () => {
		assert.equal(CASES.length + KNOWN_CASES.length, 119);
		assert.equal(KNOWN_CASES.length, 5);
	});

	it('the add field keys its suggestions and its list on the parsed name', () => {
		assert.equal(quickAddName('Shampoo x2'), 'Shampoo');
		assert.equal(quickAddName('Windeln 4', KNOWN_KEYS), 'Windeln 4');
	});
});

describe('icons and folded cards', () => {
	it('draws the basket for anything outside the set', () => {
		assert.equal(listIcon('tent'), 'tent');
		assert.equal(listIcon(null), 'basket');
		assert.equal(listIcon('constructor'), 'basket');
	});

	it('round-trips the folded keys and drops junk', () => {
		const cookie = foldedCookie(['other', 'a1b2-c3', 'seed:x:store:grocery', 'bad key;']);
		const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
		assert.deepEqual(readFolded(value), ['other', 'a1b2-c3', 'seed:x:store:grocery']);
		assert.deepEqual(readFolded('%E0%A4%A'), []);
		assert.deepEqual(readFolded(undefined), []);
	});
});
