/**
 * The one timer cook mode can have running (→ SPEC §4.6, design [7h]).
 *
 * A runes class rather than state in the page, because this is genuinely a
 * machine and three different pieces of the screen read it: the big ring on the
 * step that started it, the compact chip on every other step, and the chip row
 * that offers to start one. Keeping it here is what lets all three be dumb.
 *
 * **The row on the server is the timer; this is a rendering of it.** The page
 * counts down against the browser's own clock so the numbers move smoothly, and
 * the server counts the same seconds independently so a locked phone still gets
 * buzzed (→ `services/cook-timers.ts`, DECISIONS #15). The two only have to
 * agree about one thing — who rings — and they settle that with a claim.
 *
 * Pause and "+1:00" are both cancel-and-recreate, which is the whole reason
 * `totalSeconds` lives here rather than being read back off the row: it is what
 * *this person* set the timer for, and it has to survive a resume that the
 * server only ever sees as a shorter, newer timer.
 */
import { browser } from '$app/environment';
import type { Messages } from './i18n';
import { primeAlarm, ringAlarm } from './alarm';
import {
	claimTimerAlert,
	releaseTimer,
	requestTimer,
	TimerRequestError,
	type TimerSnapshot
} from './timer-client';

export type TimerPhase =
	/** Nothing running — the chip row offers to start one. */
	| 'idle'
	/** Counting down, here or on another step. */
	| 'running'
	/** Held. No server row exists; the remainder is frozen in memory. */
	| 'paused'
	/** Reached zero and said so. Waits to be dismissed. */
	| 'rang';

/** How the display ticks. Fast enough that the ring doesn't visibly step. */
const TICK_MS = 200;

/**
 * How far ahead of zero an open page tells the server "I've got this".
 *
 * Without a lead the two alarms are a coin flip — the page's `setTimeout` and
 * the server's fire at the same instant, and whichever claims first decides
 * whether you get a buzz from the app or a notification from the OS. Two
 * seconds is long enough that the page reliably wins while it is *visible*, and
 * short enough that a page which gets backgrounded inside the window has almost
 * certainly not been frozen yet.
 *
 * A hidden page never claims: it has probably been throttled to a tick a
 * minute, and the push is the whole point of [7h·2].
 */
const CLAIM_LEAD_MS = 2000;

export class CookTimer {
	/** Every timer this page starts deep-links back into this recipe. */
	readonly recipeId: string;

	/**
	 * The words this machine has of its own — the two failures it can report.
	 * Handed in rather than looked up: this is a plain class, not a component, so
	 * it can't reach Svelte context itself (→ `$lib/i18n/context.ts`).
	 */
	readonly #m: Messages;

	phase = $state<TimerPhase>('idle');
	/** Usually the ingredient the step is about ("Mushrooms"). */
	label = $state('');
	/** What it was set for — the "· 8:00" in "{label} · 8:00" [7h]. */
	totalSeconds = $state(0);
	/** The step it belongs to, 0-based; `null` once its recipe is unknown. */
	step = $state<number | null>(null);
	/** A refusal from the server, shown on the screen and cleared on the next try. */
	error = $state<string | null>(null);

	/** The row id, while there is one. Pausing deletes the row and clears this. */
	#id: string | null = null;
	/** Local-clock instant it fires at. */
	#endsAt = $state(0);
	/** What was left when it was paused. */
	#heldMs = $state(0);
	#now = $state(Date.now());
	#ticker: ReturnType<typeof setInterval> | null = null;

	/**
	 * Whether this page owns the alert: `true` we claimed it, `false` the server
	 * already sent the push, `null` not asked yet.
	 */
	#owned: boolean | null = null;

	/**
	 * The single in-flight `/rang` request, if one is out. `#fire` awaits *this*
	 * rather than starting its own: on a slow link the pre-zero claim can still be
	 * in flight at zero, and a second claim would race the first — the server
	 * grants exactly one, and whichever reply landed last would decide `#owned`,
	 * so a page that legitimately won could end up ringing nothing while no push
	 * was sent either.
	 */
	#claim: Promise<boolean> | null = null;

	/**
	 * Rising counter that makes a stale response harmless. Every start stamps
	 * itself; a reply that comes back after the timer was cancelled, paused or
	 * replaced finds a newer stamp and drops itself on the floor.
	 */
	#generation = 0;

	constructor(recipeId: string, active: TimerSnapshot | null, m: Messages) {
		this.recipeId = recipeId;
		this.#m = m;
		if (active) this.#adopt(active);
	}

	/* ── What the screen reads ──────────────────────────────────────────────── */

	remainingMs = $derived(
		this.phase === 'paused'
			? this.#heldMs
			: this.phase === 'running'
				? Math.max(0, this.#endsAt - this.#now)
				: 0
	);

	/** Ceiling, so a fresh 8:00 timer reads "8:00" and the last second reads "0:01". */
	remainingSeconds = $derived(Math.ceil(this.remainingMs / 1000));

	/** 1 → just started, 0 → done. What the ring's stroke is drawn from. */
	fraction = $derived(
		this.totalSeconds > 0 ? Math.min(1, this.remainingMs / (this.totalSeconds * 1000)) : 0
	);

	/** Something to show: counting, held, or waiting to be dismissed. */
	active = $derived(this.phase !== 'idle');

	/** Whether the big ring belongs on the step currently on screen [7h]. */
	isOn(stepIndex: number): boolean {
		return this.active && this.step === stepIndex;
	}

	/* ── Transitions ────────────────────────────────────────────────────────── */

	/**
	 * Start one, from the parsed chip or the manual sheet. Anything already
	 * running is replaced — here and, in the same transaction, on the server.
	 *
	 * The screen changes before the request goes out. A timer that visibly
	 * hesitates for a round trip feels broken, and the reply only ever adjusts
	 * the remainder by the milliseconds the request took.
	 */
	start(seconds: number, label: string, stepIndex: number | null): void {
		// The click that got here is the user activation the audio context needs;
		// minutes later, when it rings, there won't be one (→ `alarm.ts`).
		primeAlarm();

		const generation = ++this.#generation;

		this.error = null;
		this.label = label;
		this.totalSeconds = seconds;
		this.step = stepIndex;
		this.#owned = null;
		this.#claim = null;
		this.#begin(seconds * 1000);

		void requestTimer({
			seconds,
			label,
			recipeId: this.recipeId,
			stepIndex
		}).then(
			(timer) => {
				if (generation !== this.#generation) {
					// Superseded while in flight — and now orphaned on the server, since
					// whatever replaced it cancelled the *previous* row, not this one.
					void releaseTimer(timer.id);
					return;
				}

				this.#id = timer.id;
				// Trust the server's remainder over our own: it is the clock the push
				// is scheduled against.
				this.#endsAt = Date.now() + timer.remainingMs;
			},
			(failure: unknown) => {
				if (generation !== this.#generation) return;

				this.#clear();
				this.error =
					failure instanceof TimerRequestError ? failure.message : this.#m.cooking.cook.timerFailed;
			}
		);

		// Whatever was running isn't released from here: `startTimer` cancels every
		// live row for this person inside the same transaction as the insert, so a
		// DELETE would be a second request for work already done.
	}

	/** Stop everything [7h]. */
	cancel(): void {
		this.#generation++;
		this.#release();
		this.#clear();
	}

	/**
	 * Hold it. v1 pause is "cancel the server's alarm, keep the time on screen"
	 * (→ DECISIONS #15) — so a paused timer exists only in this tab, and a reload
	 * loses it. That is the honest trade for not adding a column: an alarm that
	 * is paused is an alarm that must not fire.
	 */
	pause(): void {
		if (this.phase !== 'running') return;

		this.#generation++;
		this.#heldMs = this.remainingMs;
		this.phase = 'paused';
		this.#stopTicking();
		this.#release();
	}

	/** Pick it back up — a new row, ending as far out as the frozen remainder. */
	resume(): void {
		if (this.phase !== 'paused') return;

		const generation = ++this.#generation;
		const seconds = Math.max(1, Math.round(this.#heldMs / 1000));

		this.#owned = null;
		this.#claim = null;
		this.#begin(seconds * 1000);

		void requestTimer({
			seconds,
			label: this.label,
			recipeId: this.recipeId,
			stepIndex: this.step
		}).then(
			(timer) => {
				if (generation !== this.#generation) {
					void releaseTimer(timer.id);
					return;
				}
				this.#id = timer.id;
				this.#endsAt = Date.now() + timer.remainingMs;
			},
			() => {
				if (generation !== this.#generation) return;
				// The countdown on screen is still right; only the locked-phone half
				// is missing, so say so rather than throwing the timer away.
				this.error = this.#m.cooking.cook.offline;
			}
		);
	}

	/**
	 * "+1:00" [7h]. The total grows with the remainder, so the ring keeps meaning
	 * "how much of what I set is left" rather than jumping back to full.
	 */
	addMinute(): void {
		if (this.phase === 'paused') {
			this.#heldMs += 60_000;
			this.totalSeconds += 60;
			return;
		}

		if (this.phase !== 'running') return;

		const seconds = Math.max(1, Math.round(this.remainingMs / 1000)) + 60;
		const total = this.totalSeconds + 60;

		this.start(seconds, this.label, this.step);
		this.totalSeconds = total;
	}

	/** Acknowledge a timer that has rung, clearing the screen [7h]. */
	dismiss(): void {
		if (this.phase !== 'rang') return;
		this.#clear();
	}

	/** The page is leaving. Stops the interval; the server row keeps its alarm. */
	dispose(): void {
		this.#stopTicking();
	}

	/* ── Machinery ──────────────────────────────────────────────────────────── */

	#adopt(timer: TimerSnapshot): void {
		this.#id = timer.id;
		this.label = timer.label;
		this.totalSeconds = timer.totalSeconds;
		this.step = timer.stepIndex;
		this.#begin(timer.remainingMs);
	}

	#begin(remainingMs: number): void {
		this.#endsAt = Date.now() + remainingMs;
		this.#now = Date.now();
		this.phase = 'running';
		this.#startTicking();
	}

	#clear(): void {
		this.#stopTicking();
		this.#id = null;
		this.phase = 'idle';
		this.label = '';
		this.totalSeconds = 0;
		this.step = null;
		this.#heldMs = 0;
		this.#owned = null;
		this.#claim = null;
	}

	/** Tell the server to forget the row, without waiting to hear back. */
	#release(): void {
		const id = this.#id;
		this.#id = null;
		if (id) void releaseTimer(id);
	}

	#startTicking(): void {
		// `setInterval` during SSR would run for the life of the process.
		if (!browser || this.#ticker !== null) return;

		this.#ticker = setInterval(() => this.#tick(), TICK_MS);
		this.#tick();
	}

	#stopTicking(): void {
		if (this.#ticker === null) return;
		clearInterval(this.#ticker);
		this.#ticker = null;
	}

	#tick(): void {
		this.#now = Date.now();
		if (this.phase !== 'running') return;

		const left = this.#endsAt - this.#now;
		if (left > CLAIM_LEAD_MS) return;

		if (left > 0) {
			this.#claimAhead();
			return;
		}

		void this.#fire();
	}

	/**
	 * Ask for the alert a couple of seconds early, while there is still time for
	 * the answer to come back before zero. Only while visible — a hidden page has
	 * probably been frozen, and claiming an alert it may never deliver would
	 * silence the push that is the whole point.
	 */
	#claimAhead(): void {
		const id = this.#id;
		if (this.#claim || this.#owned !== null || !id) return;
		if (document.visibilityState !== 'visible') return;

		this.#claim = claimTimerAlert(id).then((owned) => {
			this.#owned = owned;
			return owned;
		});
	}

	async #fire(): Promise<void> {
		const id = this.#id;

		this.#stopTicking();
		this.phase = 'rang';

		// Prefer, in order: an answer already in hand, the pre-zero claim still in
		// flight (never a second request racing it), then a fresh claim for a page
		// that was hidden until now — before making a noise the push may already
		// have made.
		const owned =
			this.#owned ?? (await (this.#claim ?? (id ? claimTimerAlert(id) : Promise.resolve(true))));
		this.#owned = owned;
		this.#id = null;

		if (owned) ringAlarm();
	}
}
