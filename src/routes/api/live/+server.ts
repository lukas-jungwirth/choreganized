/**
 * The live stream: server-sent events for one household (→ SPEC §3.1,
 * DECISIONS #135).
 *
 * The fourth JSON-ish endpoint, and it needs the same argument the other three
 * do (→ DECISIONS #20). A form action can't hold a connection open, and there is
 * no progressive enhancement to preserve: a list that updates while you look at
 * it is by definition a thing JavaScript does. What it is *not* is a data API —
 * an event says what changed and who did it, and the page refetches its own load
 * to find out what the list looks like now.
 *
 * **SSE rather than a WebSocket**, which is what `docs/ARCHITECTURE.md` has said
 * this would be since v1. The traffic is one-way — every write already goes
 * server-ward as a form POST — so the only thing a socket would buy is an
 * upgrade handshake adapter-node can't give us anyway: its server registers a
 * `request` listener and nothing else, so no route can ever see the socket.
 * `EventSource`, meanwhile, reconnects by itself.
 */
import { error } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { requireMemberApi } from '$lib/server/guards';
import { isLiveTopic, subscribe, type LiveEvent, type LiveTopic } from '$lib/server/live';
import type { RequestHandler } from './$types';

/**
 * A comment down the wire every 25s. Two jobs: it stays under the idle timeout
 * of anything that might sit between us and the phone, and the write failing is
 * how a connection that died without saying so gets noticed.
 */
const HEARTBEAT_MS = 25_000;

/**
 * Half an hour, then close and let `EventSource` reconnect.
 *
 * `hooks.server.ts` resolves the session once, when the stream opens, and then
 * it is frozen for as long as the connection lives — an unbounded stream would
 * outlive the session that authorised it. Reconnecting is the re-authentication,
 * and it costs one request.
 */
const MAX_STREAM_MS = 30 * 60 * 1000;

/** Retry hint for the client, in ms — `EventSource` backs off from here. */
const RETRY_MS = 3000;

export const GET: RequestHandler = (event) => {
	const { householdId } = requireMemberApi(event);
	// Even a refusal nobody will read speaks the caller's language, the way the
	// timer endpoint's do (→ DECISIONS #98).
	const topics = readTopics(event.url.searchParams.get('topics'), catalog(event.locals.locale));

	// Everything below closes over these so the two teardown paths — the stream's
	// own `cancel`, and the request aborting — can both run, in either order.
	let unsubscribe: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let lifetime: ReturnType<typeof setTimeout> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();

			/** Every write goes through here: enqueueing a closed stream throws. */
			const send = (chunk: string): boolean => {
				try {
					controller.enqueue(encoder.encode(chunk));
					return true;
				} catch {
					close();
					return false;
				}
			};

			const close = () => {
				unsubscribe?.();
				unsubscribe = null;
				if (heartbeat) clearInterval(heartbeat);
				if (lifetime) clearTimeout(lifetime);
				heartbeat = null;
				lifetime = null;
				try {
					controller.close();
				} catch {
					// Already closed — which is the normal case for the second caller.
				}
			};

			// Bytes immediately, before anything is subscribed: a proxy that buffers
			// until it has seen a body would otherwise hold the whole handshake, and
			// the client would sit in `CONNECTING` with no way to know it had arrived.
			send(`retry: ${RETRY_MS}\n\n: connected\n\n`);

			unsubscribe = subscribe(householdId, (live: LiveEvent) => {
				if (!topics.includes(live.topic)) return;
				// One line of JSON: `data:` can't carry a raw newline, and nothing in
				// an event is long enough to want the multi-line form.
				send(`event: ${live.topic}\ndata: ${JSON.stringify(live)}\n\n`);
			});

			heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
			lifetime = setTimeout(close, MAX_STREAM_MS);

			// Navigating away, locking the phone, losing the network: the request
			// aborts and `cancel` may never run, so this is the path that usually
			// frees the subscription.
			event.request.signal.addEventListener('abort', close);
		},

		cancel() {
			unsubscribe?.();
			unsubscribe = null;
			if (heartbeat) clearInterval(heartbeat);
			if (lifetime) clearTimeout(lifetime);
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			// Never store an infinite response, and never let anything in front of us
			// try to buffer it into one (`x-accel-buffering` is nginx's opt-out; the
			// deploy is behind Traefik, which doesn't buffer, but the header is free).
			//
			// No `Connection: keep-alive`: it is the HTTP/1.1 default anyway, and it
			// is a *forbidden* header under HTTP/2 — Node rejects it outright — so
			// sending it buys nothing and breaks the day this is served over h2.
			'cache-control': 'no-store',
			'x-accel-buffering': 'no'
		}
	});
};

/**
 * `?topics=shopping` — an allow-list, so a stream can never be talked into
 * relaying a topic this endpoint doesn't know it is allowed to relay.
 */
function readTopics(raw: string | null, m: Messages): LiveTopic[] {
	const asked = (raw ?? '')
		.split(',')
		.map((topic) => topic.trim())
		.filter(Boolean);

	if (asked.length === 0) error(400, m.errors.noTopic);

	const unknown = asked.filter((topic) => !isLiveTopic(topic));
	if (unknown.length > 0) error(400, m.errors.unknownTopic(unknown.join(', ')));

	return [...new Set(asked as LiveTopic[])];
}
