/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 *
 * The three halves of the shopping list that are worth pinning down in a test
 * rather than in a walkthrough: how the list splits into "still to buy" and
 * "recently bought" (the same call the server and the browser both make, so it
 * has to answer identically), which names the add field offers back — where the
 * interesting cases are the German compounds and the accents, and seeing them in
 * a running app means typing each one into the field — and what pouring a
 * recipe's ingredients onto the list does to the rows already there, which is
 * arithmetic, and arithmetic is cheaper to check here than by cooking twice.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	matchNames,
	planAdds,
	splitList,
	suggestionKey,
	type NamedAmount,
	type OrderedItem
} from './shopping.ts';

const STORES = [
	{ id: 'grocery', name: 'Grocery' },
	{ id: 'drugstore', name: 'Drugstore' }
];

/** A list item with only the fields the split cares about. */
function item(id: string, fields: Partial<OrderedItem> = {}): OrderedItem {
	return { id, storeId: 'grocery', checkedAt: null, createdAt: 1000, sortOrder: 0, ...fields };
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

	it('follows the manual order before the order things were added', () => {
		// A dragged list: sortOrder leads, so the newest item can sit first and the
		// oldest last, against what createdAt alone would say.
		const { groups } = splitList(
			[
				item('old', { createdAt: 1000, sortOrder: 2 }),
				item('new', { createdAt: 3000, sortOrder: 0 }),
				item('mid', { createdAt: 2000, sortOrder: 1 })
			],
			STORES
		);

		assert.deepEqual(
			groups[0].items.map((i) => i.id),
			['new', 'mid', 'old']
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

describe('planAdds', () => {
	/** A row still to buy. Ids are the name, so the assertions read as English. */
	function open(name: string, quantity: number | null = null, unit: string | null = null) {
		return { id: name, name, quantity, unit };
	}

	function ingredient(name: string, quantity: number | null = null, unit: string | null = null) {
		return { name, quantity, unit } satisfies NamedAmount;
	}

	const effects = (plan: ReturnType<typeof planAdds>) => plan.rows.map((row) => row.effect);

	it('writes a row for everything the list has never heard of', () => {
		const plan = planAdds([], [ingredient('Pasta', 400, 'g'), ingredient('Salt')]);

		assert.deepEqual(effects(plan), ['new', 'new']);
		assert.deepEqual(plan.inserts, [
			{ name: 'Pasta', quantity: 400, unit: 'g' },
			{ name: 'Salt', quantity: null, unit: null }
		]);
		assert.deepEqual(plan.updates, []);
	});

	it('adds the amounts up when two recipes want the same thing', () => {
		// The whole point: two cucumbers plus two cucumbers is four cucumbers, on
		// one row, not two rows of two.
		const plan = planAdds([open('Cucumber', 2, 'pcs')], [ingredient('cucumber', 2)]);

		assert.deepEqual(effects(plan), ['merge']);
		assert.deepEqual(plan.inserts, []);
		assert.deepEqual(plan.updates, [{ id: 'Cucumber', quantity: 4 }]);
		assert.deepEqual(plan.rows[0].result, { quantity: 4, unit: 'pcs' });
	});

	it('converts within a dimension, into the unit the row already wears', () => {
		const plan = planAdds(
			[open('Flour', 400, 'g'), open('Milk', 1, 'L')],
			[ingredient('flour', 1, 'kg'), ingredient('milk', 250, 'ml')]
		);

		assert.deepEqual(plan.updates, [
			{ id: 'Flour', quantity: 1400 },
			{ id: 'Milk', quantity: 1.25 }
		]);
	});

	it('leaves the row alone when the two amounts cannot be spoken of together', () => {
		const plan = planAdds(
			[open('Pasta', 400, 'g'), open('Rice')],
			[ingredient('pasta', 1, 'pack'), ingredient('rice', 500, 'g')]
		);

		// Grams and packs, and an amount meeting "some" — both are already a need
		// on the list, and only the person holding the trolley can reconcile them.
		assert.deepEqual(effects(plan), ['have', 'have']);
		assert.deepEqual(plan.inserts, []);
		assert.deepEqual(plan.updates, []);
		assert.deepEqual(plan.rows[0].result, { quantity: 400, unit: 'g' });
	});

	it('does not convert spoons, which would invent an amount nobody can shop for', () => {
		const plan = planAdds([open('Olive oil', 2, 'tbsp')], [ingredient('olive oil', 1, 'tsp')]);

		assert.deepEqual(effects(plan), ['have']);
		assert.deepEqual(plan.updates, []);
	});

	it('tops up the row it is adding when a recipe names the same thing twice', () => {
		const plan = planAdds([], [ingredient('Oil', 2, 'tbsp'), ingredient('oil', 1, 'tbsp')]);

		assert.deepEqual(effects(plan), ['new', 'merge']);
		// One row, and it asks for the three spoons the recipe adds up to.
		assert.deepEqual(plan.inserts, [{ name: 'Oil', quantity: 3, unit: 'tbsp' }]);
		assert.deepEqual(plan.updates, []);
	});

	it('tops up the oldest row when the list holds a name twice', () => {
		const plan = planAdds(
			[open('butter', 1, 'pack'), open('Butter', 2, 'pack')],
			[ingredient('Butter', 1, 'pack')]
		);

		assert.deepEqual(plan.updates, [{ id: 'butter', quantity: 2 }]);
	});

	it('lets a total outgrow what a single field may be typed with', () => {
		// 900 g is under the typed ceiling and so is another 900 g; applying that
		// ceiling to the sum would ask for less than either recipe needs.
		const plan = planAdds([open('Rice', 900, 'g')], [ingredient('rice', 900, 'g')]);

		assert.deepEqual(plan.updates, [{ id: 'Rice', quantity: 1800 }]);
	});

	it('still stops somewhere, so an afternoon of merges cannot write nonsense', () => {
		const plan = planAdds([open('Rice', 99_000, 'g')], [ingredient('rice', 5000, 'g')]);

		assert.deepEqual(plan.updates, [{ id: 'Rice', quantity: 99_999 }]);
	});

	it('writes nothing for a line with no word in it', () => {
		const plan = planAdds([], [ingredient('   ', 2, 'g')]);

		assert.deepEqual(effects(plan), ['have']);
		assert.deepEqual(plan.inserts, []);
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
