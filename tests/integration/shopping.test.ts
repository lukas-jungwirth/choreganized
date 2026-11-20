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
	getStore,
	listItemNames,
	listStores,
	purgeCheckedItems,
	quickAddItem,
	renameStore,
	setChecked,
	updateItem
} from '$lib/server/services/shopping';
import { splitList } from '$lib/utils/shopping';
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
		assert.ok(listItemNames(householdId).some((known) => known.name === 'Tomatoes'));
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

describe('lists (plan 36)', () => {
	it('every name remembers the list it last went to', () => {
		const { householdId, owner } = makeHousehold();
		const [grocery, drugstore] = listStores(householdId);

		addItem(householdId, owner.id, { name: 'Shampoo', storeId: drugstore.id });
		addItem(householdId, owner.id, { name: 'Milk', storeId: grocery.id });

		const known = listItemNames(householdId);
		assert.equal(known.find((row) => row.name === 'Shampoo')?.storeId, drugstore.id);
		assert.equal(known.find((row) => row.name === 'Milk')?.storeId, grocery.id);

		// Moving it once is how the household changes its mind.
		const again = addItem(householdId, owner.id, { name: 'shampoo', storeId: grocery.id });
		updateItem(householdId, again.id, {
			name: 'shampoo',
			quantity: null,
			unit: null,
			storeId: drugstore.id
		});
		assert.equal(
			listItemNames(householdId).find((row) => row.name === 'shampoo')?.storeId,
			drugstore.id
		);

		// A list deleted since leaves the name with no list, not a dangling id.
		deleteStore(householdId, drugstore.id);
		assert.equal(listItemNames(householdId).find((row) => row.name === 'shampoo')?.storeId, null);
	});

	it('bought rows stay with their own list, and a list with nothing on it is left out', () => {
		const { householdId, owner } = makeHousehold();
		const stores = listStores(householdId);
		const [grocery, drugstore, hardware] = stores;

		addItem(householdId, owner.id, { name: 'Bananas', storeId: grocery.id });
		const yoghurt = addItem(householdId, owner.id, { name: 'Yoghurt', storeId: grocery.id });
		const soap = addItem(householdId, owner.id, { name: 'Soap', storeId: drugstore.id });
		setChecked(householdId, yoghurt.id, owner.id, true);
		setChecked(householdId, soap.id, owner.id, true);

		const { groups } = splitList(getShoppingList(householdId), stores);

		assert.deepEqual(
			groups.map((group) => [
				group.storeId,
				group.items.map((item) => item.name),
				group.bought.map((item) => item.name)
			]),
			[
				[grocery.id, ['Bananas'], ['Yoghurt']],
				// Nothing left to buy here, but the bought row keeps the card on screen
				// so a wrong tick can still be put back.
				[drugstore.id, [], ['Soap']]
			]
		);
		assert.ok(!groups.some((group) => group.storeId === hardware.id));
	});

	it('adding a bought name puts that row back instead of writing a second one', () => {
		const { householdId, owner } = makeHousehold();
		const [grocery, drugstore] = listStores(householdId);
		const milk = addItem(householdId, owner.id, {
			name: 'Milk',
			quantity: 1,
			unit: 'L',
			storeId: grocery.id
		});
		setChecked(householdId, milk.id, owner.id, true);

		const result = quickAddItem(householdId, owner.id, { name: 'milk', storeId: grocery.id });

		assert.deepEqual(result, { itemId: milk.id, restored: true });
		const rows = getShoppingList(householdId);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].checkedAt, null);
		// No amount typed: the row keeps its own.
		assert.equal(rows[0].quantity, 1);

		// Another list's bought Milk is a fresh need there.
		setChecked(householdId, milk.id, owner.id, true);
		const elsewhere = quickAddItem(householdId, owner.id, {
			name: 'Milk',
			storeId: drugstore.id
		});
		assert.equal(elsewhere.restored, false);
		assert.equal(getShoppingList(householdId).length, 2);

		// A typed amount travels with the row it puts back.
		const back = quickAddItem(householdId, owner.id, {
			name: 'Milk',
			quantity: 2,
			unit: 'L',
			storeId: grocery.id
		});
		assert.equal(back.itemId, milk.id);
		assert.equal(getShoppingList(householdId).find((row) => row.id === milk.id)?.quantity, 2);
	});

	it('a list carries its icon, and opens only for its own household', () => {
		const a = makeHousehold();
		const b = makeHousehold();

		const camping = createStore(a.householdId, 'Camping', 'tent');
		assert.equal(camping.icon, 'tent');
		assert.equal(camping.kind, 'buy');
		// A key outside the fixed set is stored as nothing, which draws the basket.
		assert.equal(createStore(a.householdId, 'Odd', 'rocket').icon, null);

		assert.equal(renameStore(a.householdId, camping.id, 'Camping trip', 'luggage'), true);
		assert.equal(getStore(a.householdId, camping.id)?.icon, 'luggage');
		// Renaming alone keeps the icon.
		renameStore(a.householdId, camping.id, 'Camping');
		assert.equal(getStore(a.householdId, camping.id)?.icon, 'luggage');

		assert.equal(getStore(b.householdId, camping.id), undefined);
	});
});
