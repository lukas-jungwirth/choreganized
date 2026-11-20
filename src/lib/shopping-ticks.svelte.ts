/**
 * The optimistic tick, the settle and the undo bar (→ SPEC §3.1,
 * DECISIONS #105, #135), for every screen that shows shopping rows: the
 * overview and an opened list (plan 36). Lifted out of the overview's page
 * unchanged, so the two screens can't drift apart in how a tick feels.
 *
 * A closure like `item-suggest.svelte.ts`: the caller hands in a getter for its
 * rows (`data.items`, or one list's slice of them) and reads everything back
 * off the returned object, which stays live.
 *
 * Call it during component init: the cleanup `$effect`s below belong to the
 * component that called it.
 *
 * A checklist's row (plan 36 step 2) skips all of that: a tick there is
 * immediate and stays where it is, with no settle and no undo bar. Its Start
 * over is here too (`resetSubmit`), so the rows untick before the server
 * answers and the undo bar can put the ticks back.
 */
import type { RemoteTick } from '$lib/live-shopping.svelte';
import type { ShoppingListItem } from '$lib/server/services/shopping';
import type { SubmitFunction } from '@sveltejs/kit';
import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

/**
 * How long a tick plays out where it stands before the row goes
 * (→ SPEC §3.1). Long enough to read the name you just ticked — or the one a
 * housemate did — and short enough that nobody waits for it.
 */
const SETTLE_MS = 1400;

/** With the motion gone there is only the state to take in, so: less of it. */
const SETTLE_REDUCED_MS = 700;

export type ShoppingTicks = ReturnType<typeof shoppingTicks>;

type Ticker = { displayName: string; color: string };

export type ResetUndo = {
	listId: string;
	name: string;
	ticks: { id: string; checkedAt: number; by: string | null }[];
	/** Who had ticked each row, so the undo draws their avatar, not yours. Browser only. */
	tickers: Map<string, Ticker | null>;
};

export function shoppingTicks(
	source: () => ShoppingListItem[],
	options: {
		/** The ids of the lists that are checklists. */
		checklists?: () => Iterable<string>;
		/** Who is ticking: the avatar a checklist tick wears before the server answers. */
		me?: () => Ticker;
	} = {}
) {
	const checklistIds = $derived(new Set(options.checklists?.() ?? []));
	const onChecklist = (item: ShoppingListItem) =>
		item.storeId !== null && checklistIds.has(item.storeId);
	/**
	 * Checks that have been tapped but not yet confirmed: item id → the
	 * `checkedAt` we're acting as if the server had already written.
	 *
	 * Ticking a box has to feel instant, and it isn't only the circle that
	 * changes — the row strikes through and moves under "{n} bought" (and its
	 * list's header says "All done", if it was the last thing left to buy
	 * there). So the optimistic value goes through the same split the server
	 * used, and the entry is dropped again once the real data lands.
	 */
	const pending = new SvelteMap<string, number | null>();

	/** The ticker a pending tick wears when it isn't you: Start over's undo. */
	const pendingBy = new SvelteMap<string, Ticker | null>();

	/**
	 * Whose turn a row's `pending` entry is. A row can be tapped again before
	 * the first tap is answered (tick then untick, Start over then a new tick),
	 * and the earlier answer must not take away the later tap's entry: the row
	 * would show the server's in-between state until the second answer
	 * (→ DECISIONS #278). So every optimistic write takes the next number, and
	 * only the latest may let go.
	 */
	const turns = new Map<string, number>();
	/** One counter for every row, so a number is never handed out twice. */
	let lastTurn = 0;

	function claim(itemId: string) {
		lastTurn += 1;
		turns.set(itemId, lastTurn);
		return lastTurn;
	}

	/**
	 * Act as if the server had written `checkedAt` (ticked by `by`, when it
	 * isn't you). Returns the release for this write's answer, which does
	 * nothing once a later write has taken the row over.
	 */
	function hold(itemId: string, checkedAt: number | null, by?: Ticker | null) {
		const turn = claim(itemId);
		if (by === undefined) pendingBy.delete(itemId);
		else pendingBy.set(itemId, by);
		pending.set(itemId, checkedAt);
		return () => {
			if (turns.get(itemId) !== turn) return;
			turns.delete(itemId);
			pending.delete(itemId);
			pendingBy.delete(itemId);
		};
	}

	const items = $derived(
		source().map((item) => {
			if (!pending.has(item.id)) return item;
			const checkedAt = pending.get(item.id) ?? null;
			// Only a checklist tick is ever pending as ticked (a shopping tick is
			// held open while it settles), and it wears its ticker straight away.
			const checkedBy =
				checkedAt === null
					? null
					: pendingBy.has(item.id)
						? (pendingBy.get(item.id) ?? null)
						: (options.me?.() ?? item.checkedBy);
			return { ...item, checkedAt, checkedBy };
		})
	);

	/** Start over's undo, while its bar is up (→ `resetSubmit`). */
	let resetUndo = $state<ResetUndo | null>(null);

	/**
	 * Ticks playing out in place: item id → the colour to draw them in. Sage when
	 * it was you, the housemate's own colour when it wasn't.
	 *
	 * This is the other half of `pending`. A settling row is held at
	 * `checkedAt: null` so `splitList` leaves it exactly where it is, and *this*
	 * is what tells the row to look ticked anyway. When the entry goes, the real
	 * data — which arrived long ago — applies, and the row moves under "{n}
	 * bought" (→ DECISIONS #135).
	 */
	const settling = new SvelteMap<string, string>();

	/**
	 * The bookkeeping behind each settling row, and the ids whose beat is up.
	 *
	 * A settle ends on **two** conditions, not one: its time is up *and* the
	 * server's list agrees the item is checked. The beat alone isn't enough —
	 * on a slow connection (a shop basement, which is exactly where this runs)
	 * the action can still be in flight at 1.4 s, and releasing then would snap
	 * the row back to un-ticked while the undo bar said it was checked off.
	 * Holding costs nothing: the row already looks the way it will end up.
	 */
	const settleMeta = new Map<
		string,
		{
			item: ShoppingListItem;
			undoable: boolean;
			timer: ReturnType<typeof setTimeout>;
			/**
			 * The server has written the tick (our action answered, or it was a
			 * housemate's to begin with). From then on a row that reads unchecked
			 * was *put back* — a restore from the add field, a housemate's untick —
			 * rather than still on its way, and must not be held for ever.
			 */
			confirmed: boolean;
		}
	>();

	const elapsed = new SvelteSet<string>();

	/**
	 * The item the undo bar is currently offering to put back, or null.
	 *
	 * A fresh object per tick, which is what the page's `{#key}` keys on:
	 * ticking a second item replaces the bar rather than letting the new name
	 * inherit what was left of the old one's few seconds.
	 */
	let ticked = $state<{ item: ShoppingListItem } | null>(null);

	/** Stop holding a row, whether it finished or was tapped again. */
	function clearSettle(itemId: string) {
		const meta = settleMeta.get(itemId);
		if (meta) clearTimeout(meta.timer);
		settleMeta.delete(itemId);
		elapsed.delete(itemId);
		settling.delete(itemId);
		pending.delete(itemId);
	}

	/**
	 * Hold a row where it stands while its tick plays out, then let it go.
	 *
	 * `pending` at null is what does the holding: the server has the item down as
	 * checked, and until this ends we act as though it hadn't — so `splitList`
	 * leaves the row in its list and `settling` tells it to look ticked anyway.
	 * The write is never delayed, only the departure, so the other phone hears
	 * about it at once either way.
	 *
	 * `undoable` is the one difference between your tick and a housemate's: the
	 * bar that comes up at the end offers to put something back, and theirs was
	 * never yours to take away.
	 */
	function startSettle(
		item: ShoppingListItem,
		color: string,
		undoable: boolean,
		confirmed = false
	) {
		clearSettle(item.id);
		// The settle owns the row now: an earlier untick's answer must not release it.
		claim(item.id);
		pending.set(item.id, null);
		settling.set(item.id, color);

		const reduced =
			typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

		const timer = setTimeout(() => elapsed.add(item.id), reduced ? SETTLE_REDUCED_MS : SETTLE_MS);
		settleMeta.set(item.id, { item, undoable, timer, confirmed });
	}

	/**
	 * Let go of the rows whose beat is up and whose server row has caught up.
	 *
	 * Re-runs on both halves of that: `elapsed` when a beat ends, the rows when a
	 * load lands. A row that has vanished from the list altogether — a housemate
	 * deleted it, the nightly sweep took it — has nothing left to hold either, so
	 * it counts as caught up.
	 */
	$effect(() => {
		const rows = source();
		const ready = [...elapsed];

		untrack(() => {
			for (const id of ready) {
				const row = rows.find((candidate) => candidate.id === id);
				const meta = settleMeta.get(id);
				if (row && row.checkedAt === null) {
					// Still on its way: keep holding. Already written and now open
					// again: somebody put it back, so let go, with nothing to undo.
					if (meta?.confirmed) clearSettle(id);
					continue;
				}

				clearSettle(id);
				// The row is gone from its place *now*, which is the moment it becomes
				// hard to find again — so this is when the way back appears, rather
				// than a second and a half before there was anything to undo.
				if (meta?.undoable) ticked = { item: meta.item };
			}
		});
	});

	// Leaving the screen mid-settle would otherwise leave a timer holding a row
	// that no longer exists.
	$effect(() => () => {
		for (const { timer } of settleMeta.values()) clearTimeout(timer);
		settleMeta.clear();
	});

	/**
	 * A checklist tick: in place at once, and nothing to hold or undo — the row
	 * is right there to tap again.
	 */
	function toggleInPlace(item: ShoppingListItem): SubmitFunction {
		return ({ formData }) => {
			const checked = formData.get('checked') === 'true';
			const release = hold(item.id, checked ? Date.now() : null);
			return async ({ update }) => {
				await update({ reset: false });
				release();
			};
		};
	}

	function toggle(item: ShoppingListItem): SubmitFunction {
		if (onChecklist(item)) return toggleInPlace(item);

		return ({ formData }) => {
			const checked = formData.get('checked') === 'true';

			let release: (() => void) | undefined;
			if (checked) {
				// Yours is sage — the list's own accent. Only a housemate's tick wears
				// a colour, because only then is *who* part of the news.
				startSettle(item, 'var(--sage)', true);
			} else {
				// Unchecking answers at once: there is nothing to watch, and "put it
				// back" is a correction, which wants to look immediate.
				clearSettle(item.id);
				release = hold(item.id, null);
			}

			return async ({ update, result }) => {
				await update({ reset: false });
				if (checked) {
					// A tick that didn't happen must not go on being held, and must not
					// grow an undo bar for it either.
					if (result.type !== 'success') clearSettle(item.id);
					else {
						const meta = settleMeta.get(item.id);
						if (meta) meta.confirmed = true;
					}
				} else {
					release?.();
				}
				if (result.type !== 'success' && ticked?.item.id === item.id) ticked = null;
			};
		};
	}

	/** Undoing is a tick in reverse, plus taking the bar away. */
	function undo(item: ShoppingListItem): SubmitFunction {
		const submit = toggle(item);

		return (input) => {
			const done = submit(input);
			ticked = null;
			return done;
		};
	}

	/**
	 * A housemate ticked something. It plays out in their colour, in the row's own
	 * place in the walking order — the same settle your own tap gets, minus the
	 * undo bar at the end of it, because it wasn't yours to undo.
	 */
	function onRemoteTick({ itemId, actor }: RemoteTick) {
		const item = items.find((row) => row.id === itemId);
		// A checklist tick has nothing to play: it stays where it is.
		if (item && onChecklist(item)) return;
		// Only a row that is still open here has a tick to play. An event for one
		// this client already shows as bought — a late echo, a refetch that landed
		// first — must not haul it back out from under "{n} bought".
		if (!item || item.checkedAt !== null) return;
		// Already playing — most likely we both tapped the same row. Whoever
		// started it keeps it; restarting would only stutter the animation.
		if (settling.has(itemId)) return;

		// The event is the server telling us: this tick is written.
		startSettle(item, actor.color, false, true);
	}

	/**
	 * Start over on a checklist: its rows untick before the server answers, and
	 * the answer (what was unticked) becomes the undo bar.
	 */
	function resetSubmit(listId: string): SubmitFunction {
		return () => {
			const unticking = items.filter((item) => item.storeId === listId && item.checkedAt !== null);
			const releases = unticking.map((item) => hold(item.id, null));

			return async ({ result, update }) => {
				await update({ reset: false });
				for (const release of releases) release();
				const reset = result.type === 'success' ? result.data?.reset : null;
				if (
					reset &&
					typeof reset === 'object' &&
					Array.isArray(reset.ticks) &&
					reset.ticks.length
				) {
					resetUndo = {
						listId,
						name: String(reset.name),
						ticks: reset.ticks,
						tickers: new Map(unticking.map((item) => [item.id, item.checkedBy]))
					};
				}
			};
		};
	}

	/** The undo bar's Undo: the ticks back on screen at once, then on the server. */
	function undoResetSubmit(undo: ResetUndo): SubmitFunction {
		return () => {
			const releases = undo.ticks.map((tick) =>
				hold(tick.id, tick.checkedAt, undo.tickers.get(tick.id) ?? null)
			);
			resetUndo = null;
			return async ({ update }) => {
				await update({ reset: false });
				for (const release of releases) release();
			};
		};
	}

	return {
		/** The rows with every optimistic tick applied — what the screen splits. */
		get items() {
			return items;
		},
		get ticked() {
			return ticked;
		},
		get resetUndo() {
			return resetUndo;
		},
		dismissResetUndo() {
			resetUndo = null;
		},
		resetSubmit,
		undoResetSubmit,
		/** The colour a row's tick is playing out in, or undefined. */
		settling: (itemId: string) => settling.get(itemId),
		/** Whether a row is mid-settle: it reads as done already. */
		isSettling: (itemId: string) => settling.has(itemId),
		dismissUndo() {
			ticked = null;
		},
		toggle,
		undo,
		onRemoteTick
	};
}
