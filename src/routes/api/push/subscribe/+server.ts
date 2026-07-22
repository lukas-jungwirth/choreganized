/**
 * Push subscription lifecycle — POST to register this device, DELETE to forget
 * it (→ docs/ARCHITECTURE.md, one of the three JSON endpoints the
 * load-and-form-actions rule allows, DECISIONS #20).
 *
 * A form action would be the house style, but the body here is produced by
 * `PushSubscription.toJSON()` in the browser and never typed by a person, so
 * there is no form and no progressive enhancement to preserve: without
 * JavaScript there is no subscription in the first place.
 *
 * Scoped to the **user**, not the household: a subscription belongs to a
 * browser on a device, and the same person keeps theirs when they move house
 * (→ DATA-MODEL.md `push_subscriptions`).
 */
import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';
import { requireUserApi } from '$lib/server/guards';
import type { RequestHandler } from './$types';

/**
 * A cheap early-out, not the real bound: a body sent without `content-length`
 * (chunked) reads as 0 and sails past. adapter-node's `bodySizeLimit` is what
 * actually caps this; the three strings are then length-checked individually,
 * which is what keeps a 4 MB "endpoint" out of the database.
 */
const MAX_BODY_BYTES = 4096;

/** Long enough for any real push endpoint; a subscription is three short strings. */
const MAX_FIELD_CHARS = 1024;

type SubscriptionBody = {
	endpoint: string;
	keys: { p256dh: string; auth: string };
};

async function readBody(request: Request): Promise<unknown> {
	const length = Number(request.headers.get('content-length') ?? '0');
	if (length > MAX_BODY_BYTES) error(413, 'Body too large');

	try {
		return await request.json();
	} catch {
		error(400, 'Expected JSON');
	}
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_CHARS;
}

/**
 * The browser's own `PushSubscription.toJSON()` shape. Validated rather than
 * trusted: these three strings are handed straight to the push service later,
 * and a row with a null key would fail every send until someone pruned it.
 */
function parseSubscription(body: unknown): SubscriptionBody {
	const candidate = body as Partial<SubscriptionBody> | null;
	const keys = candidate?.keys;

	if (
		!isNonEmptyString(candidate?.endpoint) ||
		!isNonEmptyString(keys?.p256dh) ||
		!isNonEmptyString(keys?.auth)
	) {
		error(400, 'Expected { endpoint, keys: { p256dh, auth } }');
	}

	// Anything else is not a push endpoint, and would be a way to make the server
	// POST to an arbitrary host.
	if (!candidate.endpoint.startsWith('https://')) error(400, 'Endpoint must be https');

	return { endpoint: candidate.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/**
 * Upsert on `endpoint`, because that string *is* the device: re-subscribing
 * (new keys after a browser update) must update the row rather than collide
 * with its unique index, and a second person signing in on the same phone takes
 * the endpoint over — it can only ever deliver to whoever is signed in there.
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const user = requireUserApi(event).id;
	const { endpoint, keys } = parseSubscription(await readBody(request));
	const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null;

	db.insert(pushSubscriptions)
		.values({ userId: user, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId: user, p256dh: keys.p256dh, auth: keys.auth, userAgent }
		})
		.run();

	return json({ subscribed: true });
};

/**
 * The device asked to stop. Scoped to the signed-in user so one account can't
 * unsubscribe another's device by guessing an endpoint; a row left behind by a
 * failed delete prunes itself on the next send (410).
 */
export const DELETE: RequestHandler = async (event) => {
	const user = requireUserApi(event).id;
	const body = (await readBody(event.request)) as { endpoint?: unknown } | null;

	if (!isNonEmptyString(body?.endpoint)) error(400, 'Expected { endpoint }');

	const result = db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, user)))
		.run();

	return json({ removed: result.changes > 0 });
};
