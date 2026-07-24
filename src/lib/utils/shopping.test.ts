/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 *
 * The two halves of the shopping list that are worth pinning down in a test
 * rather than in a walkthrough: how the list splits into "still to buy" and
 * "recently bought" (the same call the server and the browser both make, so it
 * has to answer identically), and which names the add field offers back —
 * where the interesting cases are the German compounds and the accents, and
 * seeing them in a running app means typing each one into the field.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchNames, splitList, suggestionKey, type OrderedItem } from './shopping.ts';

const STORES = [
	{ id: 'grocery', name: 'Grocery' },
	{ id: 'drugstore', name: 'Drugstore' }
];

/** A list item with only the fields the split cares about. */
function item(id: string, fields: Partial<OrderedItem> = {}): OrderedItem {
	return { id, storeId: 'grocery', checkedAt: null, createdAt: 1000, ...fields };
}

describe('splitList', () => {
	it('groups what is still to buy by store, in walking order', () => {
		const { groups } = splitList(
			[
				item('a', { storeId: 'drugstore' }),
				item('b', { storeId: 'grocery' }),
				item('c', { storeId: 'drugstore' })
			],
			STORES
		);

		assert.deepEqual(
			groups.map((group) => [group.storeId, group.items.map((i) => i.id)]),
			[
				['grocery', ['b']],
				['drugstore', ['a', 'c']]
			]
		);
	});

	it('keeps open items in the order they were added', () => {
		const { groups } = splitList(
			[
				item('c', { createdAt: 3000 }),
				item('a', { createdAt: 1000 }),
				// Same millisecond — every bulk insert, including the seed.
				item('b2', { createdAt: 2000 }),
				item('b1', { createdAt: 2000 })
			],
			STORES
		);

		assert.deepEqual(
			groups[0].items.map((i) => i.id),
			['a', 'b1', 'b2', 'c']
		);
	});

	it('puts items with no store last, under a group that names itself', () => {
		const { groups } = splitList([item('loose', { storeId: null }), item('milk')], STORES);

		assert.deepEqual(
			groups.map((group) => [group.storeId, group.name]),
			[
				['grocery', 'Grocery'],
				[null, null]
			]
		);
	});

	it('drops a store with nothing left to buy', () => {
		const { groups } = splitList(
			[item('a', { storeId: 'drugstore', checkedAt: 5000 }), item('b')],
			STORES
		);

		assert.deepEqual(
			groups.map((group) => group.storeId),
			['grocery']
		);
	});

	it('lifts everything checked out of the groups, most recently bought first', () => {
		const { groups, bought } = splitList(
			[
				item('early', { checkedAt: 1000 }),
				item('open'),
				item('late', { storeId: 'drugstore', checkedAt: 9000 })
			],
			STORES
		);

		assert.deepEqual(
			groups.flatMap((group) => group.items.map((i) => i.id)),
			['open']
		);
		// Across all stores — the second list is one list.
		assert.deepEqual(
			bought.map((i) => i.id),
			['late', 'early']
		);
	});

	it('files an item whose store is gone under "Other" rather than losing it', () => {
		const { groups } = splitList([item('orphan', { storeId: 'deleted-store' })], STORES);

		assert.deepEqual(
			groups.map((group) => [group.storeId, group.items.map((i) => i.id)]),
			[[null, ['orphan']]]
		);
	});
});

describe('matchNames', () => {
	const POOL = ['Rinderhackfleisch', 'Rye bread', 'Hackbraten', 'Müsli', 'Oat milk'];

	it('offers the names that start with what was typed', () => {
		assert.deepEqual(matchNames('Rind', POOL), ['Rinderhackfleisch']);
		assert.deepEqual(matchNames('rye', POOL), ['Rye bread']);
	});

	it('finds a word inside a German compound', () => {
		// The whole reason a prefix match is not enough.
		assert.deepEqual(matchNames('hack', POOL), ['Hackbraten', 'Rinderhackfleisch']);
	});

	it('ranks the start of a name above a word inside it above anywhere', () => {
		const pool = ['Whole milk', 'Oat milk', 'Milk chocolate', 'Buttermilk'];
		assert.deepEqual(matchNames('milk', pool), [
			'Milk chocolate',
			'Whole milk',
			'Oat milk',
			'Buttermilk'
		]);
	});

	it('ignores accents in either direction', () => {
		// Typing it without the umlaut is how the umlaut gets typed for you.
		assert.deepEqual(matchNames('musli', POOL), ['Müsli']);
		assert.deepEqual(matchNames('Mü', POOL), ['Müsli']);
	});

	it('has nothing to offer for what is already typed in full', () => {
		assert.deepEqual(matchNames('müsli', POOL), []);
		assert.deepEqual(matchNames('MÜSLI', POOL), []);
		assert.deepEqual(matchNames('  Oat milk  ', POOL), []);
	});

	it('says nothing at all until something is typed', () => {
		assert.deepEqual(matchNames('', POOL), []);
		assert.deepEqual(matchNames('   ', POOL), []);
	});

	it('breaks ties on the order it was handed, which is most recent first', () => {
		assert.deepEqual(matchNames('bread', ['Rye bread', 'Flatbread', 'Bread flour']), [
			'Bread flour',
			'Rye bread',
			'Flatbread'
		]);
	});

	it('offers no more than it was asked for', () => {
		const pool = ['Milk 1', 'Milk 2', 'Milk 3'];
		assert.deepEqual(matchNames('milk', pool, 2), ['Milk 1', 'Milk 2']);
	});
});

describe('suggestionKey', () => {
	it('is one key per thing, however it was written', () => {
		assert.equal(suggestionKey('  Rinderhackfleisch '), 'rinderhackfleisch');
		assert.equal(suggestionKey('RINDERHACKFLEISCH'), 'rinderhackfleisch');
		// Accents are not folded away: "Müsli" and "Musli" stay two words, which
		// is a judgement the household gets to make (→ `matchNames` folds only
		// when *matching*).
		assert.notEqual(suggestionKey('Müsli'), suggestionKey('Musli'));
	});
});
