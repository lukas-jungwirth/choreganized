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
	readFolded,
	type KnownName
} from './lists.ts';

const LISTS = [{ id: 'grocery' }, { id: 'drugstore' }, { id: 'hardware' }];
const KNOWN: KnownName[] = [
	{ name: 'Shampoo', storeId: 'drugstore' },
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
