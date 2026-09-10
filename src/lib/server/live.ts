/**
 * The live channel: one household's changes, fanned out to whoever is looking.
 *
 * A shopping trip is the case this exists for — two phones in one shop, and a
 * tick on either one has to reach the other before somebody buys the tomatoes
 * twice (→ SPEC §3.1, DECISIONS #135). The transport is SSE, and the whole of it
 * is `api/live/+server.ts`; this file is only the hub the streams subscribe to.
 *
 * **An event is a hint, never the data.** It says what changed and who did it,
 * which is enough to animate; the list itself always comes from re-running the
 * page load. So there is no history to replay, no sequence numbers, and a client
 * that misses an event catches up by refetching — which is what it does on every
 * reconnect anyway.
 *
 * **Nothing here throws**, on the same reasoning as `push.ts`: a publish sits in
 * the middle of a service function that has already written to the database, and
 * a listener whose stream died between the write and the fan-out must not turn a
 * successful mutation into a 500.
 */

/** Who did the thing — enough to name and colour them, nothing more. */
export type LiveActor = { memberId: string; displayName: string; color: string };

/**
 * `changed` is the silent one: refresh the list, say nothing, animate nothing.
 * It carries no actor because the mutations that use it (edit, delete, reorder,
 * the nightly purge) don't take a member id — and "Elisabeth edited Milk" was
 * never worth three signature changes. What a household needs to *see* is what
 * got bought and what got added.
 */
export type LiveEvent =
	| {
			topic: 'shopping';
			kind: 'checked' | 'unchecked' | 'added';
			actor: LiveActor;
			itemId?: string;
			name?: string;
			/** A pour-in from a recipe adds many at once (→ SPEC §4.8). */
			count?: number;
	  }
	| { topic: 'shopping'; kind: 'changed' };

export type LiveTopic = LiveEvent['topic'];

/** The topics a stream may ask for. Anything else is a 400 at the endpoint. */
export const LIVE_TOPICS: readonly LiveTopic[] = ['shopping'];

export function isLiveTopic(value: string): value is LiveTopic {
	return (LIVE_TOPICS as readonly string[]).includes(value);
}

type Listener = (event: LiveEvent) => void;

/**
 * Open streams, by household. Behind a `Symbol.for` for the same reason
 * `registerCronJobs` is (→ `cron.ts`): Vite re-evaluates this module on every
 * edit, and a fresh Map would orphan every stream a running dev server is
 * holding while the old subscribers went on receiving into the void.
 *
 * Losing it costs nothing either way — the precedent is the `alarms` map in
 * `services/cook-timers.ts`. A restart drops the connections, `EventSource`
 * reconnects, and the reconnect refetches.
 */
const HUB: unique symbol = Symbol.for('choreganized.live.hub');

type LiveGlobal = typeof globalThis & { [HUB]?: Map<string, Set<Listener>> };

function hub(): Map<string, Set<Listener>> {
	const scope = globalThis as LiveGlobal;
	scope[HUB] ??= new Map();
	return scope[HUB];
}

/**
 * Listen to one household. The returned teardown is idempotent — the endpoint
 * calls it from both `cancel()` and the request's abort signal, which fire in
 * either order and sometimes both.
 */
export function subscribe(householdId: string, listener: Listener): () => void {
	const listeners = hub().get(householdId) ?? new Set<Listener>();
	listeners.add(listener);
	hub().set(householdId, listeners);

	return () => {
		const current = hub().get(householdId);
		if (!current) return;
		current.delete(listener);
		// Don't leave an empty Set behind under a household id nobody is watching:
		// this map is keyed by household and lives for the life of the process.
		if (current.size === 0) hub().delete(householdId);
	};
}

/**
 * Tell everyone looking at this household. Fire-and-forget: call it with `void`
 * from a service, after the transaction, the way `sendToMembers` is called.
 *
 * The listener list is copied before iterating because a listener that throws is
 * dropped — mutating the Set underneath its own `for…of` would skip the next one.
 */
export function publish(householdId: string, event: LiveEvent): void {
	const listeners = hub().get(householdId);
	if (!listeners || listeners.size === 0) return;

	for (const listener of [...listeners]) {
		try {
			listener(event);
		} catch (error) {
			// A stream that can't be written to is a stream that's gone. Drop it and
			// keep going: the others are still fine, and the mutation already landed.
			console.error('[live] listener failed, dropping it', error);
			listeners.delete(listener);
		}
	}

	if (listeners.size === 0) hub().delete(householdId);
}

/** Open connections for a household — for tests and for the endpoint's logging. */
export function listenerCount(householdId: string): number {
	return hub().get(householdId)?.size ?? 0;
}
