/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * The service worker: push delivery first, a thin offline story second.
 *
 * SvelteKit builds and registers this file automatically. It is the only part
 * of the app that runs with no page open, which is the whole point — a task
 * reminder or a cook timer has to reach a locked phone (→ design [7h·2]).
 *
 * Deliberately small. There are no offline mutations in v1 (→ SPEC §8), so it
 * precaches the build so the shell loads instantly, and otherwise stays out of
 * the way of the network.
 */
import { base, build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

/** New build ⇒ new cache ⇒ the old one is deleted on activate. */
const CACHE = `choreganized-${version}`;

/** Hashed build assets + everything in `static/`. Immutable, so cache-first. */
const PRECACHE = [...build, ...files];
const PRECACHED = new Set(PRECACHE);

/** Android haptics for anything that doesn't ask for its own pattern. */
const DEFAULT_VIBRATE = [90, 60, 90];

/**
 * `NotificationOptions` in `lib.webworker` only covers the core spec; `vibrate`
 * and `renotify` are service-worker extensions every browser we target
 * implements and no browser chokes on.
 */
type PushNotificationOptions = NotificationOptions & {
	renotify?: boolean;
	vibrate?: number[];
};

/** The other half of `PushPayload` in `src/lib/server/push.ts`. */
type PushPayload = {
	title: string;
	body?: string;
	tag: string;
	url: string;
	renotify?: boolean;
	vibrate?: number[];
};

/** A push that arrives unreadable still has to show *something* — see `toPayload`. */
const FALLBACK_PAYLOAD: PushPayload = {
	title: 'Choreganized',
	body: 'Something at home needs you.',
	tag: 'choreganized',
	url: `${base}/home`
};

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
		// No `skipWaiting()`: an open tab is still running the previous build and
		// still lazy-loading its chunks. The new worker takes over once the last
		// one closes, which is also the moment the old cache stops being needed.
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			// Claim the pages that were open when this worker first installed, so
			// push works without a reload.
			await sw.clients.claim();
		})()
	);
});

/* ── Fetch ────────────────────────────────────────────────────────────────── */

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	// Hashed filenames never change contents; going to the network for them is
	// pure latency.
	if (PRECACHED.has(url.pathname)) {
		event.respondWith(fromCache(url.pathname, request));
		return;
	}

	// Pages: network-first, and when there is no network, say so plainly. The
	// alternative — serving the last rendered page from a cache — would leave a
	// household staring at yesterday's shopping list believing it, and would
	// keep one member's data on the device after they sign out.
	if (request.mode === 'navigate') {
		event.respondWith(networkOrOfflineNotice(request));
		return;
	}

	// Everything else (data requests, the API) goes to the network untouched.
});

async function fromCache(pathname: string, request: Request): Promise<Response> {
	// This version's cache, not `caches.match()` — that searches every cache in
	// creation order, and after a deploy the previous version's is still around
	// until the last tab closes. Build assets are hash-named so it wouldn't
	// matter, but nothing in `static/` is: a changed icon would keep serving the
	// old bytes for as long as the old cache lived.
	const cache = await caches.open(CACHE);
	const cached = await cache.match(pathname);
	if (cached) return cached;

	// The cache was evicted (storage pressure) — the network is still there.
	return fetch(request);
}

async function networkOrOfflineNotice(request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch {
		return offlineNotice();
	}
}

/**
 * Self-contained because it is served precisely when nothing else can be
 * fetched — which is also why these are the only raw colour values in the app
 * outside `app.css` (→ DECISIONS #56).
 */
function offlineNotice(): Response {
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · Choreganized</title>
<style>
	html { height: 100% }
	body {
		margin: 0; min-height: 100%; display: flex; align-items: center; justify-content: center;
		padding: 32px; background: #F5F3EE; color: #22201C;
		font: 500 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
	}
	main { max-width: 320px; text-align: center }
	.tile {
		width: 88px; height: 88px; margin: 0 auto 22px; border-radius: 26px; background: #EFEBE2;
		display: flex; align-items: center; justify-content: center;
	}
	h1 { margin: 0 0 8px; font: 600 21px/1.2 Georgia, serif }
	p { margin: 0 0 22px; color: #8A867E }
	button {
		font: 700 15px/1 inherit; color: #fff; background: #5F8D72;
		border: 0; border-radius: 14px; padding: 14px 22px;
	}
</style>
</head>
<body>
	<main>
		<div class="tile">
			<svg width="40" height="40" viewBox="0 0 60 60" fill="none" stroke="#B7B2A9"
					 stroke-width="3.2" stroke-linejoin="round" aria-hidden="true">
				<path d="M12 33 L27 19 L42 33 V46 a3 3 0 0 1 -3 3 H15 a3 3 0 0 1 -3 -3 Z"/>
			</svg>
		</div>
		<h1>You’re offline</h1>
		<p>Choreganized needs the household server to show your list. It’ll be right here when you’re back.</p>
		<button onclick="location.reload()">Try again</button>
	</main>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
	});
}

/* ── Push ─────────────────────────────────────────────────────────────────── */

sw.addEventListener('push', (event) => {
	// `userVisibleOnly` is a promise to the browser: show a notification for
	// every push, or lose the subscription. Hence the fallback payload.
	event.waitUntil(show(toPayload(event.data)));
});

function toPayload(data: PushMessageData | null): PushPayload {
	if (!data) return FALLBACK_PAYLOAD;

	try {
		const parsed = data.json() as Partial<PushPayload> | null;
		if (!parsed?.title) return FALLBACK_PAYLOAD;

		return {
			title: parsed.title,
			body: parsed.body,
			// `renotify` without a tag is a TypeError in Chrome, so the tag has a
			// floor rather than being optional.
			tag: parsed.tag || FALLBACK_PAYLOAD.tag,
			url: parsed.url || FALLBACK_PAYLOAD.url,
			renotify: parsed.renotify,
			vibrate: parsed.vibrate
		};
	} catch {
		return FALLBACK_PAYLOAD;
	}
}

function show(payload: PushPayload): Promise<void> {
	const options: PushNotificationOptions = {
		body: payload.body,
		tag: payload.tag,
		renotify: payload.renotify ?? false,
		vibrate: payload.vibrate ?? DEFAULT_VIBRATE,
		icon: `${base}/icons/icon-192.png`,
		// Android's status-bar glyph: a monochrome silhouette it tints itself.
		badge: `${base}/icons/badge-72.png`,
		data: { url: payload.url }
	};

	return sw.registration.showNotification(payload.title, options);
}

/* ── Notification click ───────────────────────────────────────────────────── */

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const data = event.notification.data as { url?: unknown } | null;
	const url = typeof data?.url === 'string' ? data.url : FALLBACK_PAYLOAD.url;

	event.waitUntil(open(url));
});

/**
 * Reuse the tab that is already open — tapping "the bedsheets are overdue"
 * should land in the app you left, not in a third copy of it.
 */
async function open(url: string): Promise<void> {
	// Resolved against our own origin: the payload comes from our server, but a
	// notification is a link and a link gets checked.
	const target = new URL(url, sw.location.origin);
	if (target.origin !== sw.location.origin) target.href = `${sw.location.origin}${base}/home`;

	const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });

	for (const client of windows) {
		if (new URL(client.url).origin !== target.origin) continue;

		try {
			// Navigate *before* focusing. `navigate()` rejects for a client this
			// worker doesn't control (a tab from before the first install), and
			// focusing first would leave that tab in front on the wrong screen with
			// a second window opening behind it.
			if (client.url !== target.href) await client.navigate(target.href);
			await client.focus();
			return;
		} catch {
			// Nothing was touched, so a new window is a clean fallback.
			break;
		}
	}

	await sw.clients.openWindow(target.href);
}
