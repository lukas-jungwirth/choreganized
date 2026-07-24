/**
 * Start a cook timer (→ SPEC §4.6, `services/cook-timers.ts`).
 *
 * One of the three JSON endpoints the load-and-form-actions rule allows
 * (→ DECISIONS #20), for the same reason the push one is: there is no form here
 * and no progressive enhancement to preserve. A timer that only exists once
 * JavaScript has counted down to zero cannot have been started without it.
 *
 * The body carries **seconds, not an end time** — the server's clock is the one
 * the alarm and the push are scheduled against, and the response says how long
 * is left so the page can rebuild the instant in its own.
 */
import { error, json } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { requireMemberApi } from '$lib/server/guards';
import { CookTimerError, startTimer } from '$lib/server/services/cook-timers';
import type { RequestHandler } from './$types';

/** Four short fields; anything bigger is not this request. */
const MAX_BODY_BYTES = 2048;

type StartBody = {
	seconds?: unknown;
	label?: unknown;
	recipeId?: unknown;
	stepIndex?: unknown;
};

export const POST: RequestHandler = async (event) => {
	const { householdId, user } = requireMemberApi(event);
	// Cook mode shows whatever comes back verbatim (→ `lib/timer-client.ts`), so
	// even the protocol refusals speak the caller's language.
	const m = catalog(event.locals.locale);
	const body = await readBody(event.request, m);

	try {
		const timer = startTimer(householdId, user.id, {
			// Every field is re-checked in the service, next to the write — this only
			// decides what shape to hand it (→ docs/ARCHITECTURE.md).
			seconds: typeof body.seconds === 'number' ? body.seconds : Number.NaN,
			// The fallback is copy, so it comes from the caller's catalog rather than
			// from a constant in the service.
			label:
				typeof body.label === 'string' && body.label ? body.label : m.cooking.cook.defaultTimer,
			recipeId: typeof body.recipeId === 'string' ? body.recipeId : null,
			stepIndex: typeof body.stepIndex === 'number' ? body.stepIndex : null
		});

		return json(timer);
	} catch (failure) {
		if (!(failure instanceof CookTimerError)) throw failure;

		if (failure.code === 'unknown-recipe') error(404, m.errors.recipes.gone);
		error(400, m.errors.recipes.timerLength);
	}
};

async function readBody(request: Request, m: Messages): Promise<StartBody> {
	// A cheap early-out, not the real bound — a chunked body reads as 0 and sails
	// past. adapter-node's `bodySizeLimit` is what actually caps this.
	if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
		error(413, m.errors.bodyTooLarge);
	}

	try {
		return ((await request.json()) as StartBody | null) ?? {};
	} catch {
		error(400, m.errors.expectedJson);
	}
}
