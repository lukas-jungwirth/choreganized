/**
 * The browser half of the live channel (→ `server/live.ts`, DECISIONS #135).
 *
 * This is the "one place" `docs/ARCHITECTURE.md` said the SSE upgrade would be
 * isolated in. It knows about connections and nothing about shopping: what an
 * event *means* is `live-shopping.svelte.ts`'s problem.
 *
 * Two rules keep the traffic honest:
 *
 * - **Open only while somebody is looking.** The caller mounts this from the
 *   screen that needs it, and it closes itself when the tab goes to the
 *   background — a phone in a pocket has nothing to update, and a held-open
 *   connection is radio the battery pays for. (The OS usually kills it anyway;
 *   doing it ourselves means we know when it happened.)
 * - **A reconnect refetches.** There is no event history on the server and no
 *   `Last-Event-ID` bookkeeping — coming back and re-running the load is both
 *   simpler and more correct than replaying a log we'd have to keep.
 */
import { browser, dev } from '$app/environment';
import type { LiveEvent, LiveTopic } from '$lib/server/live';

/**
 * The load-dependency key the shopping screen declares with `depends` and this
 * channel invalidates. It lives here, in the plain module, rather than beside
 * the rune closure that uses it: `+page.server.ts` has to name it too, and a
 * `.svelte.ts` reaches for `$app/navigation`, which has no business on a server.
 */
export const SHOPPING_DEP = 'app:shopping';

type Options = {
	onEvent: (event: LiveEvent) => void;
	/**
	 * The stream came back after being away, so anything that changed in the gap
	 * was missed — refetch. Not called for the first connection (the page has
	 * only just loaded its data) nor for a reopen we did ourselves on becoming
	 * visible, because the app layout's `refetchOnFocus` already covers that
	 * moment (→ `refetch.ts`).
	 */
	onReconnect: () => void;
};

/**
 * Subscribe for as long as the returned teardown hasn't been called — mount it
 * from an `$effect` and hand the effect the teardown.
 */
export function openLiveStream(topics: LiveTopic[], { onEvent, onReconnect }: Options): () => void {
	if (!browser) return () => {};

	const url = `/api/live?topics=${encodeURIComponent(topics.join(','))}`;

	let source: EventSource | null = null;
	let connectedBefore = false;
	/** A reopen the focus refetch is already handling — see `onReconnect`. */
	let silentReopen = false;

	const open = () => {
		if (source) return;

		const stream = new EventSource(url);
		source = stream;

		stream.addEventListener('open', () => {
			const missed = connectedBefore && !silentReopen;
			connectedBefore = true;
			silentReopen = false;
			if (missed) onReconnect();
		});

		for (const topic of topics) {
			stream.addEventListener(topic, (message) => {
				try {
					onEvent(JSON.parse((message as MessageEvent<string>).data) as LiveEvent);
				} catch {
					// A frame we can't read is a frame we ignore: the next refetch —
					// on the next event, or on focus — is the recovery.
				}
			});
		}

		stream.addEventListener('error', () => {
			// `EventSource` retries by itself while the connection merely dropped.
			// CLOSED means it has given up for good — a refused handshake, which is
			// what an expired session looks like from here.
			if (stream.readyState !== EventSource.CLOSED) return;

			// Let go of the corpse, so `open()` doesn't mistake it for a live stream
			// and refuse to build a replacement. Hygiene rather than a rescue: in
			// practice the refusal is an expired session, and the refetch that comes
			// with the same event has already sent the screen to /login. What this
			// buys is that recovery no longer depends on the hidden branch happening
			// to have run first.
			if (source === stream) source = null;
			if (dev) console.warn('[live] stream closed by the server');
		});
	};

	const close = () => {
		source?.close();
		source = null;
	};

	const onVisibility = () => {
		if (document.visibilityState !== 'visible') {
			close();
			return;
		}
		// Only when we are actually about to reopen. Arming it against a stream
		// that is already up would leave it armed, and the next reconnect — a real
		// one, after the network dropped — would skip the catch-up it needs.
		if (!source) silentReopen = true;
		open();
	};

	document.addEventListener('visibilitychange', onVisibility);
	// A screen can be mounted by a client-side navigation while the tab is already
	// in the background (a push notification's deep link, restoring a session).
	if (document.visibilityState === 'visible') open();

	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		close();
	};
}
