/**
 * The browser half of web push: work out where this device stands, subscribe,
 * unsubscribe. Plain async functions — `EnablePush.svelte` owns the state.
 *
 * Three things make this fiddlier than it looks:
 *
 * - **Permission is per device and irreversible from our side.** Once someone
 *   picks "Block" the browser never asks again; only they can undo it in site
 *   settings. So the prompt is worth spending carefully — hence the state
 *   machine rather than a fire-and-hope button.
 * - **Chrome wants user activation.** `Notification.requestPermission()` has to
 *   be reached while the click that started it still counts, so it is the first
 *   thing `enablePush` awaits, before any service-worker lookup.
 * - **Subscriptions are bound to the VAPID public key.** Change the key and
 *   every stored subscription silently stops working, which is why
 *   ARCHITECTURE.md says generate production's pair once and never rotate it —
 *   and why a subscription made with a different key is torn down here rather
 *   than reported as working.
 */

export type PushState =
	/** Still finding out — the honest first render. */
	| 'loading'
	/** No service worker or no PushManager (iOS Safari before "Add to Home Screen"). */
	| 'unsupported'
	/** The server has no VAPID key, so there is nothing to subscribe to. */
	| 'unconfigured'
	/** Blocked in the browser. Only site settings can undo it. */
	| 'denied'
	/** Supported and available — this is the state the button is for. */
	| 'prompt'
	/** This device is registered and will get notifications. */
	| 'subscribed';

const ENDPOINT = '/api/push/subscribe';

export function pushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

/** Where this device stands right now. Never prompts, never subscribes. */
export async function readPushState(vapidKey: string): Promise<PushState> {
	if (!vapidKey) return 'unconfigured';
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';

	// `getRegistration()` rather than `.ready`, which never resolves when no
	// worker is registered and would hang the row on "loading" forever.
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();

	return subscription && matchesKey(subscription, vapidKey) ? 'subscribed' : 'prompt';
}

/**
 * Ask (if needed), subscribe, and tell the server. Returns the state to land
 * in; throws only if the server rejects the subscription, which is a real error
 * worth showing.
 */
export async function enablePush(vapidKey: string): Promise<PushState> {
	if (!vapidKey) return 'unconfigured';
	if (!pushSupported()) return 'unsupported';

	// First, while the click is still fresh. Resolves instantly when already
	// granted, so this costs nothing on a re-subscribe.
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'prompt';

	const registration = await navigator.serviceWorker.ready;
	let subscription = await registration.pushManager.getSubscription();

	// A subscription made against an older VAPID key can never be delivered to;
	// replace it rather than leave a row that only fails at send time.
	if (subscription && !matchesKey(subscription, vapidKey)) {
		await subscription.unsubscribe();
		subscription = null;
	}

	subscription ??= await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(vapidKey)
	});

	try {
		const response = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(subscription.toJSON())
		});

		if (!response.ok) throw new Error(`Could not register this device (${response.status})`);
	} catch (failure) {
		// Undo the browser half. A subscription the server never stored is worse
		// than none at all: `readPushState` would find it, call this device
		// subscribed, and nothing would ever arrive — with no way back except
		// switching off and on again. Rolling back leaves a state you can retry.
		await subscription.unsubscribe().catch(() => {});
		throw failure;
	}

	return 'subscribed';
}

/**
 * Stop notifying this device. The server is told first, while we still hold the
 * endpoint; if that call fails we unsubscribe anyway — the row then prunes
 * itself on the next send, and the user's intent ("stop buzzing me") is served
 * either way.
 */
export async function disablePush(): Promise<PushState> {
	if (!pushSupported()) return 'unsupported';

	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();

	if (subscription) {
		try {
			await fetch(ENDPOINT, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ endpoint: subscription.endpoint })
			});
		} catch (error) {
			console.warn('[push] could not remove the subscription server-side:', error);
		}

		await subscription.unsubscribe();
	}

	return Notification.permission === 'denied' ? 'denied' : 'prompt';
}

/* ── Key plumbing ─────────────────────────────────────────────────────────── */

/** Is this subscription bound to the key the server is currently signing with? */
function matchesKey(subscription: PushSubscription, vapidKey: string): boolean {
	const applied = subscription.options.applicationServerKey;
	if (!applied) return false;
	return toBase64Url(applied) === vapidKey.replace(/=+$/, '');
}

/** `applicationServerKey` wants bytes; the key travels as base64url text. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
	const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
	const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

/** The way back, for comparing a live subscription's key with ours. */
function toBase64Url(buffer: ArrayBuffer): string {
	let binary = '';
	for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);

	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
