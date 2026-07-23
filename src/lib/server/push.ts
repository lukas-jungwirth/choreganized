/**
 * Web push (VAPID) — the one module that talks to the push service.
 *
 * Two rules, both from docs/ARCHITECTURE.md "Notifications":
 *
 * - **Nothing here throws.** Event-driven sends are fire-and-forget (`void
 *   sendToMembers(…)` straight out of a service, never awaited in a request),
 *   so a push service having a bad afternoon must not fail an action — or, in
 *   Node 24, take the process down via an unhandled rejection. Every exported
 *   function catches and logs, and reports how many devices it reached.
 * - **A dead subscription prunes itself.** 404/410 from the push service means
 *   that endpoint will never work again (the browser unsubscribed, the app was
 *   uninstalled); the row goes.
 *
 * Payload contract with `src/service-worker.ts`: `PushPayload`, JSON-encoded.
 * `title` carries the message — see docs/DECISIONS.md #55.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import webpush from 'web-push';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { db } from './db';
import { members, pushSubscriptions, type PushSubscription } from './db/schema';

/**
 * What the service worker hands to `showNotification`.
 *
 * `title` is the whole message ("🛒 Elisabeth added 3 items to the list"): it's
 * the bold line, the one that survives truncation on a lock screen, and the
 * platform already prints the app name above it (→ DECISIONS #55).
 */
export type PushPayload = {
	title: string;
	/** Optional second line. Most notifications say everything in the title. */
	body?: string;
	/** Groups & replaces: a second `task-due-{id}` overwrites the first. */
	tag: string;
	/** Same-origin deep link `notificationclick` focuses or opens. */
	url: string;
	/** Buzz again when replacing a notification with the same `tag`. */
	renotify?: boolean;
	/** Android haptics; the service worker has a default. */
	vibrate?: number[];
};

/** The `members` columns that gate a category of notification (→ SPEC §3.5, §5.6). */
export type NotificationPref =
	'notifyTaskReminders' | 'notifyOverdueNudges' | 'notifyShoppingUpdates';

export type SendOptions = {
	/**
	 * How long the push service may keep trying, in seconds. Everything this app
	 * sends is about *now* — "due today", "the pasta is done" — so the default is
	 * deliberately short: a phone that was off all weekend should not wake up to
	 * Friday's nudges. (web-push's own default is four weeks.)
	 */
	ttlSeconds?: number;
};

export type MemberSendOptions = SendOptions & {
	/** Member id to skip — you are never told about your own action. */
	except?: string;
	/** Only members with this preference switched on. */
	pref?: NotificationPref;
};

const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

/** A hung socket in a cron sweep is worse than a dropped notification. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * VAPID identifies *us* to the push service. Configured once at import; if the
 * keys are missing or malformed the app runs perfectly well without push rather
 * than refusing to boot — a missing key is a deployment detail, not a bug in
 * the shopping list.
 */
const vapidConfigured = configureVapid();

function configureVapid(): boolean {
	// `vite build` evaluates server modules to prerender; there is no env there
	// and nothing to send to.
	if (building) return false;

	const publicKey = publicEnv.PUBLIC_VAPID_PUBLIC_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;
	const subject = env.VAPID_SUBJECT || 'mailto:hello@choreganized.app';

	if (!publicKey || !privateKey) {
		console.warn(
			'[push] PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — notifications are off. Generate a pair with `npx web-push generate-vapid-keys`.'
		);
		return false;
	}

	try {
		webpush.setVapidDetails(subject, publicKey, privateKey);
		return true;
	} catch (error) {
		console.error('[push] invalid VAPID configuration — notifications are off:', error);
		return false;
	}
}

/** Whether the server can send at all; the UI uses it to explain itself. */
export function pushConfigured(): boolean {
	return vapidConfigured;
}

/* ── Sending ──────────────────────────────────────────────────────────────── */

/**
 * Every device this user has registered. The test notification and (plan 08)
 * cook timers, which belong to the person cooking rather than to the household.
 *
 * @returns how many devices actually took it — 0 is a normal answer.
 */
export async function sendToUser(
	userId: string,
	payload: PushPayload,
	options: SendOptions = {}
): Promise<number> {
	try {
		return await deliver([userId], payload, options);
	} catch (error) {
		// `deliver` catches everything it knows about; this is the belt that keeps
		// the "nothing here throws" contract true for both entry points, so a
		// `void sendToUser(…)` can never become an unhandled rejection.
		console.error('[push] send to user failed:', error);
		return 0;
	}
}

/**
 * Everyone in the household, minus `except`, minus anyone who switched `pref`
 * off. The workhorse for household events (shopping adds, task reminders).
 */
export async function sendToMembers(
	householdId: string,
	payload: PushPayload,
	options: MemberSendOptions = {}
): Promise<number> {
	try {
		const filters = [eq(members.householdId, householdId)];
		if (options.except) filters.push(ne(members.id, options.except));
		if (options.pref) filters.push(eq(members[options.pref], true));

		const userIds = db
			.select({ userId: members.userId })
			.from(members)
			.where(and(...filters))
			.all()
			.map((row) => row.userId);

		return await deliver(userIds, payload, options);
	} catch (error) {
		console.error('[push] could not resolve recipients:', error);
		return 0;
	}
}

async function deliver(
	userIds: string[],
	payload: PushPayload,
	options: SendOptions
): Promise<number> {
	if (!vapidConfigured || userIds.length === 0) return 0;

	let subscriptions: PushSubscription[];
	try {
		subscriptions = db
			.select()
			.from(pushSubscriptions)
			.where(inArray(pushSubscriptions.userId, userIds))
			.all();
	} catch (error) {
		console.error('[push] could not read subscriptions:', error);
		return 0;
	}

	if (subscriptions.length === 0) return 0;

	// One JSON encode for all of them; the payload is identical per device.
	const body = JSON.stringify(payload);
	const results = await Promise.all(
		subscriptions.map((subscription) => deliverOne(subscription, body, options))
	);

	return results.filter(Boolean).length;
}

async function deliverOne(
	subscription: PushSubscription,
	body: string,
	options: SendOptions
): Promise<boolean> {
	try {
		await webpush.sendNotification(
			{
				endpoint: subscription.endpoint,
				keys: { p256dh: subscription.p256dh, auth: subscription.auth }
			},
			body,
			{ TTL: options.ttlSeconds ?? DEFAULT_TTL_SECONDS, timeout: REQUEST_TIMEOUT_MS }
		);
		return true;
	} catch (error) {
		const status = statusOf(error);

		// 404/410: the endpoint is gone for good — the browser unsubscribed, the
		// PWA was uninstalled, the profile was wiped. Anything else (a 5xx, a
		// timeout) might work next time, so the row stays.
		if (status === 404 || status === 410) {
			prune(subscription);
		} else {
			console.error(
				`[push] send failed (${status ?? 'no status'}):`,
				error instanceof Error ? error.message : error
			);
		}

		return false;
	}
}

/** web-push throws `WebPushError`; duck-typed so a wrapped error still prunes. */
function statusOf(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
	const { statusCode } = error as { statusCode: unknown };
	return typeof statusCode === 'number' ? statusCode : undefined;
}

function prune(subscription: PushSubscription): void {
	try {
		db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id)).run();
		console.log(`[push] pruned dead subscription for user ${subscription.userId}`);
	} catch (error) {
		console.error('[push] could not prune dead subscription:', error);
	}
}

/* ── Events ───────────────────────────────────────────────────────────────── */

export type ShoppingAddNotice = {
	householdId: string;
	/** Who added — skipped as a recipient, and the key the coalescing counts by. */
	actorMemberId: string;
	/** How many items this one action put on the list. */
	itemCount: number;
};

/** "Max one per member per ~15 min" (→ SPEC §3.5). */
const SHOPPING_COALESCE_MS = 15 * 60 * 1000;

/**
 * When each member last set off a shopping notification, keyed
 * `{householdId}:{memberId}`.
 *
 * In memory, not in a column, and losing it on restart is fine: the worst case
 * is one extra notification after a deploy. Unpacking a week's shop one item at
 * a time is exactly the storm SPEC §3.5 forbids, and this is what stops it.
 */
const lastShoppingNotice = new Map<string, number>();

/**
 * "🛒 {member} added {n} items to the list" (→ SPEC §3.5), to every *other*
 * member with `notifyShoppingUpdates` on.
 *
 * Fire-and-forget: called from `services/shopping.ts` for every path that adds
 * — the quick field, the sheet, and plan 07's "add all ingredients" — and it
 * returns before anything leaves the machine.
 */
export function notifyShoppingAdd(notice: ShoppingAddNotice): void {
	// Written the positive way round: `itemCount < 1` lets NaN through, and the
	// copy would go out reading "added NaN items to the list".
	if (!vapidConfigured || !(notice.itemCount >= 1)) return;

	try {
		const key = `${notice.householdId}:${notice.actorMemberId}`;
		const now = Date.now();
		const last = lastShoppingNotice.get(key);
		if (last !== undefined && now - last < SHOPPING_COALESCE_MS) return;

		// The copy names the member, so a member who has since left the household
		// (or a forged id) has nothing to announce.
		const actor = db
			.select({ displayName: members.displayName })
			.from(members)
			.where(and(eq(members.id, notice.actorMemberId), eq(members.householdId, notice.householdId)))
			.get();

		if (!actor) return;

		lastShoppingNotice.set(key, now);
		forgetStaleNotices(now);

		const items = notice.itemCount === 1 ? '1 item' : `${notice.itemCount} items`;

		void sendToMembers(
			notice.householdId,
			{
				title: `🛒 ${actor.displayName} added ${items} to the list`,
				// One per member: a second add replaces the first on the lock screen
				// instead of stacking.
				tag: `shopping-add-${notice.actorMemberId}`,
				url: '/shopping'
			},
			{ except: notice.actorMemberId, pref: 'notifyShoppingUpdates' }
		);
	} catch (error) {
		console.error('[push] shopping notification failed:', error);
	}
}

/** Entries outside the window can never suppress anything again. */
function forgetStaleNotices(now: number): void {
	for (const [key, at] of lastShoppingNotice) {
		if (now - at >= SHOPPING_COALESCE_MS) lastShoppingNotice.delete(key);
	}
}

/**
 * "Does this actually work?", answered on the device that asks (→ SPEC §6,
 * Settings → Notifications). The only notification in the app a member sends
 * to themselves.
 */
export async function sendTestNotification(userId: string): Promise<number> {
	return sendToUser(
		userId,
		{
			title: '🔔 Notifications are on',
			body: 'This is what a nudge from Choreganized looks like.',
			tag: 'push-test',
			url: '/settings',
			renotify: true
		},
		// A test you asked for a minute ago is worthless an hour later.
		{ ttlSeconds: 60 }
	);
}
