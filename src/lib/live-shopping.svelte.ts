/**
 * What a live event *means* on the shopping screen (→ SPEC §3.1,
 * DECISIONS #135). The connection itself is `live.ts`; this decides what to do
 * with what comes down it.
 *
 * Three things happen for every event, in this order:
 *
 * 1. **Refetch, always** — a coalesced `invalidate('app:shopping')`. The event
 *    is a hint; the list comes from the server load, so the browser never has a
 *    second opinion about grouping or walking order.
 * 2. **Hand a housemate's tick to the page**, which plays it out in the row's
 *    own place before letting it go to "recently bought". Your own events are
 *    skipped here — your tap already started that animation.
 * 3. **Say who did what**, once, in a toast — because the row may be below the
 *    fold, or folded into a collapsed section, or the change may be an *add*
 *    with no row to animate at all.
 *
 * A closure rather than a class, for the same reason `item-suggest.svelte.ts`
 * is one: the caller's member id arrives as a getter and has to stay live.
 */
import { invalidate } from '$app/navigation';
import type { LiveActor, LiveEvent } from '$lib/server/live';
import { SHOPPING_DEP, openLiveStream } from './live';

/**
 * Long enough that ten ticks in a row cost one refetch, short enough that a
 * single one still feels immediate.
 */
const COALESCE_MS = 200;

/** How long the toast stays. A shade under the undo bar's five seconds. */
const NOTICE_MS = 4000;

/** A housemate's tick, on its way to the row that has to play it. */
export type RemoteTick = { itemId: string; kind: 'checked' | 'unchecked'; actor: LiveActor };

export type LiveNoticeState = {
	kind: 'checked' | 'added';
	actor: LiveActor;
	/** The item's name, when it was a single one — otherwise null and `count`. */
	name: string | null;
	count: number;
};

export type LiveShopping = ReturnType<typeof liveShopping>;

/**
 * @param memberId who is looking — your own events are yours already
 * @param onRemoteTick a housemate ticked a row; the page animates it in place
 */
export function liveShopping(memberId: () => string, onRemoteTick: (tick: RemoteTick) => void) {
	let notice = $state<LiveNoticeState | null>(null);

	let refetch: ReturnType<typeof setTimeout> | null = null;
	let expiry: ReturnType<typeof setTimeout> | null = null;

	/**
	 * One refetch per burst. Never *skipped* — only ever delayed — including for
	 * your own action, which has already invalidated on its own: that redundant
	 * fetch is what keeps a second device of the same member correct, and it is
	 * one route-data request. Suppressing it would mean threading a connection id
	 * through every form on the screen to buy nothing.
	 */
	const scheduleRefetch = () => {
		if (refetch) return;
		refetch = setTimeout(() => {
			refetch = null;
			void invalidate(SHOPPING_DEP);
		}, COALESCE_MS);
	};

	/**
	 * A second event from the same person while their toast is still up becomes
	 * a count — somebody working down their half of the list should not produce
	 * a queue of toasts. Anyone else replaces it.
	 */
	const announce = (
		kind: 'checked' | 'added',
		actor: LiveActor,
		name: string | null,
		n: number
	) => {
		const same = notice?.actor.memberId === actor.memberId && notice.kind === kind;
		notice = same
			? { kind, actor, name: null, count: notice!.count + n }
			: { kind, actor, name, count: n };

		if (expiry) clearTimeout(expiry);
		expiry = setTimeout(() => {
			notice = null;
			expiry = null;
		}, NOTICE_MS);
	};

	const handle = (event: LiveEvent) => {
		scheduleRefetch();

		// `changed` is the silent kind — an edit, a delete, a reorder, the nightly
		// purge. The list refreshes; nothing is announced.
		if (event.kind === 'changed') return;
		if (event.actor.memberId === memberId()) return;

		if (event.kind === 'added') {
			announce('added', event.actor, event.name ?? null, event.count ?? 1);
			return;
		}

		if (event.itemId) onRemoteTick({ itemId: event.itemId, kind: event.kind, actor: event.actor });
		// Unchecking is not news: the row comes *back* onto the list, where it is
		// its own announcement. Only a tick takes something away from you.
		if (event.kind === 'checked') announce('checked', event.actor, event.name ?? null, 1);
	};

	return {
		get notice() {
			return notice;
		},

		/** Hand this straight to an `$effect` — the teardown is the effect's. */
		start(): () => void {
			const stop = openLiveStream(['shopping'], {
				onEvent: handle,
				onReconnect: scheduleRefetch
			});

			return () => {
				stop();
				if (refetch) clearTimeout(refetch);
				if (expiry) clearTimeout(expiry);
				refetch = null;
				expiry = null;
				notice = null;
			};
		}
	};
}
