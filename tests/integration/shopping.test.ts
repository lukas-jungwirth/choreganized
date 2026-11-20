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
import { afterEach, describe, it, vi } from 'vitest';
import { listMembers } from '$lib/server/services/household';
import { getHomeSummary } from '$lib/server/services/home';
import { listOverdueForMember } from '$lib/server/services/tasks';
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
	listOpenItems,
	listStoresWithCounts,
	quickAddItem,
	renameStore,
	resetList,
	setChecked,
	setStoreKind,
	undoReset,
	updateItem
} from '$lib/server/services/shopping';
import { shoppingActions } from '$lib/server/shopping-actions';
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

describe('checklists (plan 36 step 2)', () => {
	afterEach(() => vi.useRealTimers());

	const HOUR = 60 * 60 * 1000;

	/** A household with a checklist, "Vacation packing", last in the order. */
	function packing(housemates: string[] = []) {
		const fixture = makeHousehold({ housemates });
		const [grocery] = listStores(fixture.householdId);
		const list = createStore(fixture.householdId, 'Vacation packing', 'luggage', 'checklist');
		const add = (name: string) =>
			addItem(fixture.householdId, fixture.owner.id, { name, storeId: list.id });
		return { ...fixture, grocery, list, add };
	}

	it('the nightly sweep leaves a checklist tick of 13 hours ago alone', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2036-06-18T08:00:00Z'));
		const { householdId, owner, grocery, add } = packing();
		const passports = add('Passports');
		const milk = addItem(householdId, owner.id, { name: 'Milk', storeId: grocery.id });
		setChecked(householdId, passports.id, owner.id, true);
		setChecked(householdId, milk.id, owner.id, true);

		vi.setSystemTime(new Date('2036-06-18T21:00:00Z'));
		const removed = purgeCheckedItems(householdId, new Date(Date.now() - 12 * HOUR));

		assert.equal(removed, 1);
		assert.deepEqual(
			getShoppingList(householdId).map((item) => [item.name, item.checkedAt !== null]),
			[['Passports', true]]
		);
	});

	it('a ticked checklist row stays in place and says who ticked it', () => {
		const { householdId, members, list, add } = packing(['Elisabeth']);
		const [, elisabeth] = members;
		const rows = ['Passports', 'Sunscreen', 'Swimwear'].map(add);
		setChecked(householdId, rows[0].id, elisabeth.id, true);

		const [group] = splitList(getShoppingList(householdId), listStores(householdId)).groups;

		assert.equal(group.storeId, list.id);
		assert.equal(group.kind, 'checklist');
		assert.deepEqual(
			group.items.map((item) => [item.name, item.checkedBy?.displayName ?? null]),
			[
				['Passports', 'Elisabeth'],
				['Sunscreen', null],
				['Swimwear', null]
			]
		);
		assert.deepEqual(group.bought, []);
	});

	it('Start over unticks every row in one go, and its undo puts the same ticks back', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2036-06-18T08:00:00Z'));
		const { householdId, members, list, add } = packing(['Elisabeth']);
		const [owner, elisabeth] = members;
		const [passports, chargers, sunscreen] = ['Passports', 'Chargers', 'Sunscreen'].map(add);
		setChecked(householdId, passports.id, owner.id, true);
		vi.setSystemTime(new Date('2036-06-18T09:00:00Z'));
		setChecked(householdId, chargers.id, elisabeth.id, true);
		const before = getShoppingList(householdId);

		vi.setSystemTime(new Date('2036-06-18T10:00:00Z'));
		const reset = resetList(householdId, owner.id, list.id);

		assert.equal(reset?.name, 'Vacation packing');
		assert.equal(reset?.ticks.length, 2);
		assert.ok(getShoppingList(householdId).every((item) => item.checkedAt === null));

		assert.equal(undoReset(householdId, list.id, reset!.ticks), 2);
		const after = getShoppingList(householdId);
		for (const id of [passports.id, chargers.id, sunscreen.id]) {
			const was = before.find((item) => item.id === id)!;
			const is = after.find((item) => item.id === id)!;
			assert.equal(is.checkedAt, was.checkedAt, `${was.name}'s tick time`);
			assert.deepEqual(is.checkedBy, was.checkedBy, `${was.name}'s ticker`);
		}
	});

	it('the undo trusts nothing it is handed back', () => {
		const { householdId, owner, list, add } = packing();
		const other = makeHousehold();
		const [mine, retick, future] = ['Passports', 'Towels', 'Hat'].map(add);
		const theirs = addItem(other.householdId, other.owner.id, { name: 'Theirs' });
		const since = Date.now() - HOUR;

		const restored = undoReset(
			householdId,
			list.id,
			[
				// A ticker from another household is nobody's tick here.
				{ id: mine.id, checkedAt: since, by: other.owner.id },
				// Ticked again since the reset: the new tick stays.
				{ id: retick.id, checkedAt: since, by: owner.id },
				// No tick from the future.
				{ id: future.id, checkedAt: Date.now() + HOUR, by: owner.id },
				// Another household's row.
				{ id: theirs.id, checkedAt: since, by: other.owner.id }
			].map((tick, index) => {
				if (index === 1) setChecked(householdId, retick.id, owner.id, true);
				return tick;
			})
		);

		assert.equal(restored, 1);
		const rows = getShoppingList(householdId);
		const row = (id: string) => rows.find((item) => item.id === id)!;
		assert.equal(row(mine.id).checkedAt, since);
		assert.equal(row(mine.id).checkedBy, null);
		assert.notEqual(row(retick.id).checkedAt, since);
		assert.equal(row(future.id).checkedAt, null);
		assert.equal(getShoppingList(other.householdId)[0].checkedAt, null);
	});

	it('only a checklist of this household can be started over', () => {
		const { householdId, owner, grocery, list } = packing();
		const other = makeHousehold();

		assert.equal(resetList(householdId, owner.id, grocery.id), null);
		assert.equal(resetList(other.householdId, other.owner.id, list.id), null);
		assert.equal(setStoreKind(other.householdId, list.id, 'buy'), false);
	});

	it("Home's stat tile counts shopping only", () => {
		const { householdId, owner, grocery, add } = packing();
		add('Passports');
		add('Sunscreen');
		addItem(householdId, owner.id, { name: 'Milk', storeId: grocery.id });

		const today = '2036-06-18';
		const summary = getHomeSummary(householdId, {
			member: owner,
			timezone: 'Europe/Vienna',
			today,
			members: listMembers(householdId),
			overdue: listOverdueForMember(householdId, owner, today)
		});

		assert.equal(summary.shoppingCount, 1);
	});

	it("a recipe neither tops up a checklist's row nor lands on a checklist", () => {
		const fixture = makeHousehold({ storeNames: ['Vacation packing', 'Grocery'] });
		const { householdId, owner } = fixture;
		// A checklist first in the order: the pour-in still goes to shopping.
		const [list, grocery] = listStores(householdId);
		setStoreKind(householdId, list.id, 'checklist');
		addItem(householdId, owner.id, { name: 'Sunscreen', quantity: 1, storeId: list.id });

		const result = addIngredients(householdId, owner.id, [{ name: 'Sunscreen', quantity: 2 }]);

		assert.deepEqual(result, { added: 1, merged: 0, skipped: 0 });
		// Same millisecond, so not in a fixed order: compare as a set.
		const rows = getShoppingList(householdId).map((item) => [
			item.name,
			item.storeId,
			item.quantity
		]);
		assert.equal(rows.length, 2);
		assert.deepEqual(
			rows.find((row) => row[1] === list.id),
			['Sunscreen', list.id, 1]
		);
		assert.deepEqual(
			rows.find((row) => row[1] === grocery.id),
			['Sunscreen', grocery.id, 2]
		);
		assert.deepEqual(
			listOpenItems(householdId).map((item) => item.quantity),
			[2]
		);
	});

	it('a checklist add teaches the add field nothing and never puts a row back', () => {
		const { householdId, owner, list, add } = packing();
		const towels = add('Towels');
		setChecked(householdId, towels.id, owner.id, true);

		const again = quickAddItem(householdId, owner.id, { name: 'Towels', storeId: list.id });

		assert.equal(again.restored, false);
		assert.equal(getShoppingList(householdId).length, 2);
		assert.ok(!listItemNames(householdId).some((known) => known.name === 'Towels'));
	});

	it('shopping list → checklist keeps its bought rows ticked, in place', () => {
		const { householdId, owner, grocery } = packing();
		const bread = addItem(householdId, owner.id, { name: 'Bread', storeId: grocery.id });
		addItem(householdId, owner.id, { name: 'Milk', storeId: grocery.id });
		setChecked(householdId, bread.id, owner.id, true);

		assert.equal(setStoreKind(householdId, grocery.id, 'checklist'), true);

		const group = splitList(getShoppingList(householdId), listStores(householdId)).groups.find(
			(candidate) => candidate.storeId === grocery.id
		)!;
		assert.equal(group.kind, 'checklist');
		assert.deepEqual(
			group.items.map((item) => [item.name, item.checkedAt !== null]),
			[
				['Bread', true],
				['Milk', false]
			]
		);
		// ...and the sweep no longer takes it.
		assert.equal(purgeCheckedItems(householdId, new Date(Date.now() + HOUR)), 0);
	});

	it('checklist → shopping list puts its ticked rows under "bought", for the sweep', () => {
		const { householdId, owner, list, add } = packing();
		const passports = add('Passports');
		add('Sunscreen');
		setChecked(householdId, passports.id, owner.id, true);

		assert.equal(setStoreKind(householdId, list.id, 'buy'), true);

		const group = splitList(getShoppingList(householdId), listStores(householdId)).groups.find(
			(candidate) => candidate.storeId === list.id
		)!;
		assert.equal(group.kind, 'buy');
		assert.deepEqual(
			group.bought.map((item) => item.name),
			['Passports']
		);
		assert.equal(purgeCheckedItems(householdId, new Date(Date.now() + HOUR)), 1);
	});

	it('deleting a checklist deletes its rows; deleting a shopping list moves them to Other', () => {
		const { householdId, owner, grocery, list, add } = packing();
		add('Passports');
		add('Sunscreen');
		addItem(householdId, owner.id, { name: 'Milk', storeId: grocery.id });

		assert.equal(
			listStoresWithCounts(householdId).find((store) => store.id === list.id)?.itemCount,
			2
		);
		assert.equal(deleteStore(householdId, list.id), true);
		assert.equal(deleteStore(householdId, grocery.id), true);

		assert.deepEqual(
			getShoppingList(householdId).map((item) => [item.name, item.storeId]),
			[['Milk', null]]
		);
	});
});

describe('the add field reads the amount (plan 37)', () => {
	/** The add field's post, through the action itself: parse, `literal`, known names. */
	async function quickAdd(
		fixture: ReturnType<typeof makeHousehold>,
		line: string,
		fields: Record<string, string> = {}
	) {
		const form = new FormData();
		form.set('quick', '1');
		form.set('name', line);
		for (const [key, value] of Object.entries(fields)) form.set(key, value);
		const event = {
			locals: {
				user: { id: fixture.owner.userId },
				member: fixture.owner,
				locale: 'en'
			},
			request: new Request('http://localhost/shopping?/add', { method: 'POST', body: form })
		} as unknown as Parameters<typeof shoppingActions.add>[0];
		return shoppingActions.add(event);
	}

	it('"Gurken x3" is Gurken, three of them', async () => {
		const fixture = makeHousehold();
		await quickAdd(fixture, 'Gurken x3');

		const [row] = getShoppingList(fixture.householdId);
		assert.deepEqual([row.name, row.quantity, row.unit], ['Gurken', 3, null]);
	});

	it('a line added as typed is remembered, and the same line is not split again', async () => {
		const fixture = makeHousehold();
		const { householdId } = fixture;

		await quickAdd(fixture, 'Windeln 4', { literal: '1' });
		assert.ok(listItemNames(householdId).some((known) => known.name === 'Windeln 4'));

		// Bought, swept: the name outlives the row.
		const first = getShoppingList(householdId)[0];
		deleteItem(householdId, first.id);

		await quickAdd(fixture, 'Windeln 4');
		const [again] = getShoppingList(householdId);
		assert.deepEqual([again.name, again.quantity], ['Windeln 4', null]);

		// An amount on top of the known name is still read.
		deleteItem(householdId, again.id);
		await quickAdd(fixture, 'Windeln 4 x2');
		const [two] = getShoppingList(householdId);
		assert.deepEqual([two.name, two.quantity], ['Windeln 4', 2]);
	});
});
