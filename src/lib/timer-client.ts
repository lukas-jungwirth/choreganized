/**
 * The browser half of cook timers — three fetches, no state (that's
 * `cook-timer.svelte.ts`). Same split as `push-client.ts` ⟷ `EnablePush.svelte`.
 *
 * `TimerSnapshot` is the other half of `CookTimerView` in
 * `lib/server/services/cook-timers.ts`, the way the service worker's payload
 * type is the other half of `PushPayload`. Note what it does *not* carry: an
 * absolute end time. The server answers with how long is left, and the page
 * turns that into an instant on its own clock — a phone whose clock is a minute
 * off the server's would otherwise render a minute that isn't there.
 */
export type TimerSnapshot = {
	id: string;
	label: string;
	recipeId: string | null;
	/** 0-based; the URL and the copy say `+ 1`. */
	stepIndex: number | null;
	totalSeconds: number;
	remainingMs: number;
};

export type StartTimerRequest = {
	seconds: number;
	label: string;
	/** Nullable: a timer whose recipe was deleted still resumes. */
	recipeId: string | null;
	stepIndex: number | null;
	/** The row this machine hands in, if it holds one (→ DECISIONS #15). */
	replaces: string | null;
};

const ENDPOINT = '/api/timers';

/** Thrown with the server's own message, which the screen shows as-is. */
export class TimerRequestError extends Error {}

export async function requestTimer(input: StartTimerRequest): Promise<TimerSnapshot> {
	const response = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});

	if (!response.ok) throw new TimerRequestError(await messageFrom(response));

	return (await response.json()) as TimerSnapshot;
}

/**
 * Stop the server's alarm. Cancel, Pause and "+1:00" all start here — the last
 * two by creating a fresh timer straight afterwards (→ DECISIONS #15).
 */
export async function releaseTimer(id: string): Promise<void> {
	await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * "I'm awake, I'll ring this one myself." Claims the timer's single alert so no
 * push is sent to the phone already showing the countdown.
 *
 * A network failure answers `true`: if we can't reach the server, no push is
 * getting out either, and this page is the only alert there is.
 */
export async function claimTimerAlert(id: string): Promise<boolean> {
	try {
		const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}/rang`, { method: 'POST' });
		if (!response.ok) return true;

		return ((await response.json()) as { owned?: boolean }).owned ?? true;
	} catch {
		return true;
	}
}

/** SvelteKit's `error()` bodies are `{ message }`; anything else gets a floor. */
async function messageFrom(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { message?: unknown };
		if (typeof body.message === 'string' && body.message) return body.message;
	} catch {
		// Not JSON — a proxy's error page, or nothing at all.
	}

	return "That timer wouldn't start.";
}
