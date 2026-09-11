/**
 * The shopping list through its service (→ services/shopping.ts, SPEC §3).
 *
 * `utils/shopping.test.ts` already pins the arithmetic of merging amounts; what
 * is worth a database is what wraps it — that a row lands in the right store
 * with the next walking position, that ticking is reversible, that the recipe
 * pour merges into rows that already exist, and above all that one household's
 * rows are invisible and immovable from another's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	addIngredients,
	addItem,
	createStore,
	deleteItem,
	deleteStore,
	getShoppingList,
	listItemNames,
	listStores,
	purgeCheckedItems,
	renameStore,
	setChecked,
	updateItem
} from '$lib/server/services/shopping';
import { makeHousehold } from '../helpers/db';

describe('addItem', () => {
	it('lands in the chosen store at the next walking position, and is remembered', () => {
		const { householdId, owner } = makeHousehold();
		const [grocery] = listStores(householdId);

		const first = addItem(householdId, owner.id, { name: 'Tomatoes', storeId: grocery.id });
		const second = addItem(householdId, owner.id, {
			name: 'Oat milk',
			quantity: 2,
			unit: 'L',
			storeId: grocery.id
		});

		assert.equal(first.sortOrder, 0);
		assert.equal(second.sortOrder, 1);
		assert.equal(second.quantity, 2);
		assert.equal(second.unit, 'L');

		// In walking order: two rows added in the same millisecond tie on
		// `createdAt`, and the screen sorts its groups by `sortOrder` anyway.
		const list = getShoppingList(householdId).sort((a, b) => a.sortOrder - b.sortOrder);
		assert.deepEqual(
			list.map((item) => [item.name, item.storeId, item.addedBy?.displayName]),
			[
				['Tomatoes', grocery.id, 'Owner'],
				['Oat milk', grocery.id, 'Owner']
			]
		);
		assert.ok(listItemNames(householdId).includes('Tomatoes'));
	});

	it('a store id from another household is treated as "no store"', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const [foreignStore] = listStores(b.householdId);

		const item = addItem(a.householdId, a.owner.id, { name: 'Bread', storeId: foreignStore.id });

		assert.equal(item.storeId, null);
	});
});

describe('ticking', () => {
	it('is reversible and stamps who ticked', () => {
		const { householdId, owner } = makeHousehold();
		const item = addItem(householdId, owner.id, { name: 'Avocado' });

		assert.equal(setChecked(householdId, item.id, owner.id, true), true);
		assert.ok(getShoppingList(householdId)[0].checkedAt);

		assert.equal(setChecked(householdId, item.id, owner.id, false), true);
		assert.equal(getShoppingList(householdId)[0].checkedAt, null);
	});

	it('the cleanup sweep only removes ticked rows older than the cut-off, per household', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const old = addItem(a.householdId, a.owner.id, { name: 'Old' });
		const fresh = addItem(a.householdId, a.owner.id, { name: 'Fresh' });
		const foreign = addItem(b.householdId, b.owner.id, { name: 'Foreign' });
		for (const item of [old, fresh]) setChecked(a.householdId, item.id, a.owner.id, true);
		setChecked(b.householdId, foreign.id, b.owner.id, true);

		// Push `Old` into the past by re-ticking it against a fixed clock is not
		// possible through the service, so purge with a cut-off in the future for
		// A only and check B is untouched.
		const removed = purgeCheckedItems(a.householdId, new Date(Date.now() + 60_000));

		assert.equal(removed, 2);
		assert.equal(getShoppingList(a.householdId).length, 0);
		assert.equal(getShoppingList(b.householdId).length, 1);
	});
});

describe('the household boundary', () => {
	it('another household can neither see, edit, tick nor delete a row', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const item = addItem(a.householdId, a.owner.id, { name: 'Private' });

		assert.equal(getShoppingList(b.householdId).length, 0);
		assert.equal(
			updateItem(b.householdId, item.id, {
				name: 'Hijacked',
				quantity: null,
				unit: null,
				storeId: null
			}),
			false
		);
		assert.equal(setChecked(b.householdId, item.id, b.owner.id, true), false);
		assert.equal(deleteItem(b.householdId, item.id), false);

		const [still] = getShoppingList(a.householdId);
		assert.equal(still.name, 'Private');
		assert.equal(still.checkedAt, null);
	});

	it('stores are scoped the same way', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const store = createStore(a.householdId, 'Bakery');

		assert.equal(renameStore(b.householdId, store.id, 'Taken'), false);
		assert.equal(deleteStore(b.householdId, store.id), false);
		assert.ok(listStores(a.householdId).some((s) => s.name === 'Bakery'));
		assert.ok(!listStores(b.householdId).some((s) => s.name === 'Bakery'));
	});
});

describe('addIngredients (pouring a recipe onto the list)', () => {
	it('merges into an open row with the same name and unit, adds the rest, skips the blank', () => {
		const { householdId, owner } = makeHousehold();
		addItem(householdId, owner.id, { name: 'Tomatoes', quantity: 2, unit: 'pcs' });

		const result = addIngredients(householdId, owner.id, [
			{ name: 'tomatoes', quantity: 3, unit: 'pcs' },
			{ name: 'Coconut milk', quantity: 400, unit: 'ml' },
			{ name: '   ' }
		]);

		assert.deepEqual(result, { added: 1, merged: 1, skipped: 1 });
		const byName = new Map(getShoppingList(householdId).map((item) => [item.name, item]));
		assert.equal(byName.get('Tomatoes')?.quantity, 5);
		assert.equal(byName.get('Coconut milk')?.quantity, 400);
		assert.equal(byName.size, 2);
	});

	it('does not merge into a row that is already ticked', () => {
		const { householdId, owner } = makeHousehold();
		const bought = addItem(householdId, owner.id, { name: 'Onions', quantity: 1, unit: 'pcs' });
		setChecked(householdId, bought.id, owner.id, true);

		const result = addIngredients(householdId, owner.id, [
			{ name: 'Onions', quantity: 2, unit: 'pcs' }
		]);

		assert.equal(result.added, 1);
		assert.equal(result.merged, 0);
		assert.equal(getShoppingList(householdId).length, 2);
	});
});
