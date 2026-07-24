/**
 * The timers the app has running (→ SPEC §4.6, design [7h], DECISIONS #102–103).
 *
 * Two objects. `CookTimer` is one timer as a machine; `CookTimers` — exported at
 * the bottom as the singleton `cookTimers` — is the collection, and it is what
 * every screen actually reads. Four surfaces render off it: the big ring on the
 * step that started a timer, the compact bars for the others, the chip row that
 * offers to start one, and the dock above the tab bar on every screen that is
 * *not* cook mode.
 *
 * **The rows on the server are the timers; these are a rendering of them.** The
 * page counts down against the browser's own clock so the numbers move smoothly,
 * and the server counts the same seconds independently so a locked phone still
 * gets buzzed (→ `services/cook-timers.ts`, DECISIONS #15). The two only have to
 * agree about one thing — who rings — and they settle that with a claim.
 *
 * The collection is a **module singleton** for one reason above all others: the
 * claim (→ DECISIONS #83) has to have exactly one owner no matter which screen
 * is up. Two surfaces counting down the same timer and both claiming would let
 * the loser go silent while no push was sent either. It is also what makes the
 * dock appear the moment you *leave* cook mode, which load data alone cannot do
 * — the `(app)` layout load reads no `event.url`, so it does not re-run on a
 * client-side navigation.
 *
 * A module singleton on a server is shared between requests, so this is filled
 * only from `$effect`s — which never run during SSR — and every write refuses
 * outside the browser.
 *
 * Pause and "+1:00" are both cancel-and-recreate, which is the whole reason
 * `totalSeconds` lives here rather than being read back off the row: it is what
 * *this person* set the timer for, and it has to survive a resume that the
 * server only ever sees as a shorter, newer timer.
 */
import { browser } from '$app/environment';
import type { Messages } from './i18n';
import { primeAlarm, ringAlarm } from './alarm';
import { TIMERS_MAX, timerHref } from './utils/timer-parse';
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
 * Without a lead the two alarms are a coin flip — the page's countdown and the
 * server's fire at the same instant, and whichever claims first decides whether
 * you get a buzz from the app or a notification from the OS. Two seconds is long
 * enough that the page reliably wins while it is *visible*, and short enough
 * that a page which gets backgrounded inside the window has almost certainly not
 * been frozen yet.
 *
 * A hidden page never claims: it has probably been throttled to a tick a minute,
 * and the push is the whole point of [7h·2].
 */
const CLAIM_LEAD_MS = 2000;

/**
 * How long after this tab released a row it still refuses to re-adopt it.
 *
 * `pause` and `cancel` fire their DELETE without waiting, so a load that was
 * already in flight can come back still listing the row. Adopting it would
 * start a second machine counting down against a row that is about to be
 * cancelled — a timer on screen that rings nothing.
 */
const RELEASE_GRACE_MS = 10_000;

/** DOM identity for `{#each}`, nothing more — see `CookTimer.key`. */
let nextKey = 0;

export class CookTimer {
	/**
	 * Stable across "+1:00" and resume, both of which replace the server row — so
	 * an `{#each}` keys off this rather than off an id that changes under it.
	 *
	 * A counter, not `crypto.randomUUID()`, for the reason `RecipeForm` uses one:
	 * this is a DOM identity, not a secret. `crypto.randomUUID` is also
	 * **secure-context only**, so it is `undefined` over plain HTTP — which is
	 * exactly how the app gets opened on a real phone at a LAN address to test
	 * the wake lock and the push. A throw here would take every timer with it.
	 */
	readonly key = `t${nextKey++}`;

	/**
	 * The words this machine has of its own — the two failures it can report.
	 * Handed in rather than looked up: this is a plain class, not a component, so
	 * it can't reach Svelte context itself (→ `$lib/i18n/context.ts`).
	 */
	readonly #m: Messages;

	/**
	 * Told when this machine stops existing, so the collection can forget it.
	 * The message is passed **explicitly**, not read off `error`: a cancel must
	 * not republish a stale warning from a refusal ten minutes ago.
	 */
	readonly #gone: (timer: CookTimer, message?: string | null) => void;

	/** Told when this machine needs the collection's interval running. */
	readonly #wake: () => void;

	phase = $state<TimerPhase>('idle');
	/** Usually the ingredient the step is about ("Mushrooms"). */
	label = $state('');
	/** What it was set for — the "· 8:00" in "{label} · 8:00" [7h]. */
	totalSeconds = $state(0);
	/** The step it belongs to, 0-based; `null` once its recipe is unknown. */
	step = $state<number | null>(null);
	/** The timer's *own* recipe, never the screen's. `null` once it's deleted. */
	recipeId = $state<string | null>(null);
	/** A refusal from the server, shown on the screen and cleared on the next try. */
	error = $state<string | null>(null);

	/** The row id, while there is one. Pausing deletes the row and clears this. */
	#id: string | null = null;
	/** The last row this machine let go of, and when — see `#release`. */
	#releasedId: string | null = null;
	#releasedAt = 0;
	/**
	 * When `#id` was last confirmed by the server. A snapshot older than this
	 * cannot know about the row, so it must not be read as "cancelled elsewhere".
	 */
	#confirmedAt = 0;
	/** Local-clock instant it fires at. */
	#endsAt = $state(0);
	/** What was left when it was paused. */
	#heldMs = $state(0);
	#now = $state(Date.now());

	/**
	 * A start is out. `sync` must not adopt a row this machine already owns but
	 * hasn't been told the id of yet — that would give one row two machines, both
	 * counting down and both claiming, and the loser of a claim goes silent.
	 */
	#pending = $state(false);

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

	constructor(
		m: Messages,
		gone: (timer: CookTimer, message?: string | null) => void,
		wake: () => void
	) {
		this.#m = m;
		this.#gone = gone;
		this.#wake = wake;
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

	/** The row this machine holds, while it holds one. */
	get rowId(): string | null {
		return this.#id;
	}

	/** Whether a start is still in flight — see `#pending`. */
	get pending(): boolean {
		return this.#pending;
	}

	/** When the server last confirmed `rowId` — see `CookTimers.sync`. */
	get confirmedAt(): number {
		return this.#confirmedAt;
	}

	/** Where tapping this timer goes, from anywhere in the app. */
	get href(): string {
		return timerHref(this.recipeId, this.step);
	}

	/** Whether the big ring belongs on the step currently on screen [7h]. */
	isOn(recipeId: string, stepIndex: number): boolean {
		return this.active && this.recipeId === recipeId && this.step === stepIndex;
	}

	/* ── Transitions ────────────────────────────────────────────────────────── */

	/**
	 * Start counting, from the parsed chip or the manual sheet.
	 *
	 * The screen changes before the request goes out. A timer that visibly
	 * hesitates for a round trip feels broken, and the reply only ever adjusts
	 * the remainder by the milliseconds the request took.
	 */
	begin(input: {
		seconds: number;
		label: string;
		recipeId: string | null;
		stepIndex: number | null;
	}): void {
		// The click that got here is the user activation the audio context needs;
		// minutes later, when it rings, there won't be one (→ `alarm.ts`). Every
		// path — the chip, the sheet, `addMinute` — comes through here, which is
		// why the priming lives here and not in the collection.
		primeAlarm();

		/**
		 * Whether this is a *replacement* rather than a first start. It decides
		 * what a refusal means: a fresh start that never became a row must go, but
		 * a "+1:00" whose request failed still has its original row alive — the
		 * `replaces` cancel is inside the same transaction, so it rolled back with
		 * it — and throwing that away would delete a pan somebody is watching.
		 */
		const replacing = this.#id !== null;

		const generation = ++this.#generation;

		this.error = null;
		this.label = input.label;
		this.totalSeconds = input.seconds;
		this.step = input.stepIndex;
		this.recipeId = input.recipeId;
		this.#owned = null;
		this.#claim = null;
		this.#pending = true;
		this.#begin(input.seconds * 1000);

		void requestTimer({
			seconds: input.seconds,
			label: input.label,
			recipeId: input.recipeId,
			stepIndex: input.stepIndex,
			replaces: this.#id
		}).then(
			(timer) => {
				// Cleared on *every* path, before the generation check: a start that
				// was superseded by a pause still has to stop counting as in-flight,
				// or `sync` refuses to run for as long as this machine lives.
				this.#pending = false;

				if (generation !== this.#generation) {
					// Superseded while in flight — and now orphaned on the server, since
					// whatever replaced it named the *previous* row, not this one.
					void releaseTimer(timer.id);
					return;
				}

				this.#id = timer.id;
				this.#confirmedAt = Date.now();
				// Trust the server's remainder over our own: it is the clock the push
				// is scheduled against.
				this.#endsAt = Date.now() + timer.remainingMs;
			},
			(failure: unknown) => {
				this.#pending = false;
				if (generation !== this.#generation) return;

				this.error =
					failure instanceof TimerRequestError ? failure.message : this.#m.cooking.cook.timerFailed;

				// A replacement keeps its old row and keeps counting — see `replacing`.
				// The screen is a minute ahead of the alarm until the next sync, which
				// is a far smaller lie than a pan that vanished off the hob.
				if (replacing) return;

				// A start that never became a timer must not linger: it would hold a
				// slot against the cap and, with `remainingMs === 0`, outrank every
				// real timer in the dock.
				this.#clear();
				this.#gone(this, this.error);
			}
		);

		// Whatever this machine was already holding isn't released from here:
		// `replaces` above cancels exactly that row inside the same transaction as
		// the insert, so a DELETE would be a second request for work already done
		// — and unlike the blanket cancel it used to lean on, it names one row, so
		// nothing else of this person's is touched (→ DECISIONS #102).
	}

	/** Stop it [7h]. */
	cancel(): void {
		this.#generation++;
		this.#release();
		this.#clear();
		this.#gone(this);
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
		// A start can still be in flight — Pause is tappable the moment the
		// countdown appears. Its reply will find a newer generation and drop
		// itself, so nothing here is waiting on it any more.
		this.#pending = false;
		this.#release();
	}

	/** Pick it back up — a new row, ending as far out as the frozen remainder. */
	resume(): void {
		if (this.phase !== 'paused') return;

		// Same reason as `begin`: this tap is the activation the alarm will need.
		primeAlarm();

		const generation = ++this.#generation;
		const seconds = Math.max(1, Math.round(this.#heldMs / 1000));

		this.#owned = null;
		this.#claim = null;
		this.#pending = true;
		this.#begin(seconds * 1000);

		void requestTimer({
			seconds,
			label: this.label,
			recipeId: this.recipeId,
			stepIndex: this.step,
			replaces: this.#id
		}).then(
			(timer) => {
				this.#pending = false;
				if (generation !== this.#generation) {
					void releaseTimer(timer.id);
					return;
				}
				this.#id = timer.id;
				this.#confirmedAt = Date.now();
				this.#endsAt = Date.now() + timer.remainingMs;
			},
			(failure: unknown) => {
				this.#pending = false;
				if (generation !== this.#generation) return;

				if (failure instanceof TimerRequestError) {
					// A **refusal** — the cap, most likely, since resume asks for a slot
					// like any other start. Going back to held is the honest answer: a
					// countdown that keeps running with no row behind it would look
					// exactly like a timer that is going to buzz, and never would.
					this.error = failure.message;
					this.phase = 'paused';
					return;
				}

				// A network blip, by contrast: the countdown on screen is still right
				// and only the locked-phone half is missing, so say that and keep it.
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

		// One in flight at a time. `replaces` is read from `#id`, which the reply
		// is what updates — so a second tap inside one round trip would hand the
		// server the *previous*, already-cancelled row id, cancel nothing, and
		// leave the row this tap created holding a slot against the cap that
		// nothing on the client knows about. Tapping again a moment later works.
		if (this.#pending) return;

		const seconds = Math.max(1, Math.round(this.remainingMs / 1000)) + 60;
		const total = this.totalSeconds + 60;

		this.begin({
			seconds,
			label: this.label,
			recipeId: this.recipeId,
			stepIndex: this.step
		});
		this.totalSeconds = total;
	}

	/** Acknowledge a timer that has rung, clearing it off the screen [7h]. */
	dismiss(): void {
		if (this.phase !== 'rang') return;
		this.#clear();
		this.#gone(this);
	}

	/* ── Machinery ──────────────────────────────────────────────────────────── */

	/** Adopt a row the server told us about — a cold start, or another phone. */
	adopt(timer: TimerSnapshot): void {
		this.#id = timer.id;
		this.#confirmedAt = Date.now();
		this.label = timer.label;
		this.totalSeconds = timer.totalSeconds;
		this.step = timer.stepIndex;
		this.recipeId = timer.recipeId;
		this.#begin(timer.remainingMs);
	}

	/** One sample of the clock, driven by the collection's single interval. */
	tick(now: number): void {
		this.#now = now;
		if (this.phase !== 'running') return;

		const left = this.#endsAt - this.#now;
		if (left > CLAIM_LEAD_MS) return;

		if (left > 0) {
			this.#claimAhead();
			return;
		}

		void this.#fire();
	}

	#begin(remainingMs: number): void {
		this.#endsAt = Date.now() + remainingMs;
		this.#now = Date.now();
		this.phase = 'running';
		this.#wake();
	}

	#clear(): void {
		this.#id = null;
		this.phase = 'idle';
		this.label = '';
		this.totalSeconds = 0;
		this.step = null;
		this.#heldMs = 0;
		this.#owned = null;
		this.#claim = null;
		this.#pending = false;
	}

	/**
	 * Tell the server to forget the row, without waiting to hear back.
	 *
	 * The id is remembered for a moment afterwards so `sync` can recognise it:
	 * a load already in flight when this fired will come back still listing the
	 * row, and adopting it would put a second machine on a row that is about to
	 * be cancelled — a countdown that rings nothing (→ `releasedRecently`).
	 */
	#release(): void {
		const id = this.#id;
		this.#id = null;
		if (!id) return;

		this.#releasedId = id;
		this.#releasedAt = Date.now();
		void releaseTimer(id);
	}

	/** Whether this machine just let go of `rowId` — see `#release`. */
	releasedRecently(rowId: string, now: number): boolean {
		return this.#releasedId === rowId && now - this.#releasedAt < RELEASE_GRACE_MS;
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

/**
 * Every timer this person has going, and the one interval that drives them.
 *
 * One interval rather than one per timer, because three countdowns disagreeing
 * by up to 200 ms is exactly the kind of thing a kitchen notices.
 */
export class CookTimers {
	#timers = $state<CookTimer[]>([]);
	#ticker: ReturnType<typeof setInterval> | null = null;
	#m: Messages | null = null;
	/** Whether the visibility listener is already attached — see `ready`. */
	#listening = false;

	/** A start that never became a timer — cook mode's chip row shows it. */
	lastError = $state<string | null>(null);

	/**
	 * Everything with something on screen, soonest first — **including paused
	 * ones**, which cook mode still has to draw. Three items five times a second
	 * is free; always right isn't.
	 */
	all = $derived(
		this.#timers.filter((timer) => timer.active).sort((a, b) => a.remainingMs - b.remainingMs)
	);

	/**
	 * What the *dock* speaks for: the same list without the paused ones.
	 *
	 * A paused timer has no server row and its remainder is frozen (→ #15), so
	 * outside cook mode it would render as a countdown that never moves and that
	 * nothing on that screen can start again — a bar claiming a pan is being
	 * watched when it isn't. Cook mode has the ring, the wording and the Resume
	 * button for it; every other screen is better off silent (→ DECISIONS #103).
	 */
	unpaused = $derived(this.all.filter((timer) => timer.phase !== 'paused'));

	any = $derived(this.unpaused.length > 0);

	/**
	 * Only what the server would count: a paused timer has no row, and a rung one
	 * is already stamped. The 409 is the backstop — this is so the chip greys out
	 * honestly rather than letting you tap into a refusal.
	 */
	atCap = $derived(
		this.#timers.filter((timer) => timer.phase === 'running' || timer.pending).length >= TIMERS_MAX
	);

	/**
	 * What the dock shows: whatever needs you next. A rung timer outranks a
	 * running one, because it is the one with something to say.
	 */
	next = $derived(
		this.unpaused.find((timer) => timer.phase === 'rang') ?? this.unpaused[0] ?? null
	);

	/**
	 * Handed the catalog once, by the app layout: a plain class can't read Svelte
	 * context itself (→ `$lib/i18n/context.ts`).
	 */
	ready(m: Messages): void {
		if (!browser) return;

		// Re-set rather than kept: `reset()` clears it on sign-out, and whoever
		// signs in next may be reading a different language.
		this.#m = m;

		if (this.#listening) return;
		this.#listening = true;

		// Keeps the audio context warm across a backgrounded tab, so a claim two
		// seconds before zero can still make a noise (→ `alarm.ts`). Attached once
		// for the life of the document — `reset()` deliberately leaves it alone
		// rather than growing a listener per sign-in.
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && this.any) primeAlarm();
		});
	}

	/** The ring's timer: this recipe, this step. */
	forStep(recipeId: string, stepIndex: number): CookTimer | null {
		return this.all.find((timer) => timer.isOn(recipeId, stepIndex)) ?? null;
	}

	start(input: {
		seconds: number;
		label: string;
		recipeId: string | null;
		stepIndex: number | null;
	}): void {
		if (!browser || !this.#m) return;

		if (this.atCap) {
			this.lastError = this.#m.cooking.cook.timerCapped(TIMERS_MAX);
			return;
		}

		this.lastError = null;
		const timer = this.#make();
		this.#timers = [...this.#timers, timer];
		timer.begin(input);
	}

	/**
	 * Fill in from the server's list (→ `(app)/+layout.server.ts`).
	 *
	 * A merge, not a replacement. This store is the only thing that knows about a
	 * timer whose POST is still in flight, or one that is paused — pause deletes
	 * the row (→ DECISIONS #15) — or one that has rung and is waiting to be
	 * acknowledged. What the server knows and this store doesn't runs the other
	 * way: a cold start with a pan already on, or a timer started on the other
	 * phone.
	 *
	 * The one thing a sync may take *away* is a timer that has a confirmed row,
	 * is still running, is no longer listed, has more than the claim lead left,
	 * **and** whose row the snapshot could actually have known about — that is a
	 * cancel from somewhere else. Anything closer to zero is mid-claim (our own
	 * pre-zero claim stamps `notifiedAt`, which drops the row out of the list),
	 * and pulling it out from under its own alarm would silence the alert it just
	 * won.
	 *
	 * `fetchedAt` is what makes that last clause possible. `refetchOnFocus` can
	 * have a load in flight while a start commits: the POST answers first, then
	 * the older payload lands without the row, and a naive drop would delete a
	 * live timer that goes on to push minutes later.
	 *
	 * MUST be called inside `untrack`: it reads `$state` that it also writes, and
	 * that the ticker writes five times a second.
	 */
	sync(snapshots: TimerSnapshot[], fetchedAt: number): void {
		if (!browser || !this.#m) return;
		// A machine mid-POST owns a row it hasn't been told the id of yet; adopting
		// it here would give one row two machines, both counting down and both
		// claiming — and the loser of a claim goes silent.
		if (this.#timers.some((timer) => timer.pending)) return;

		const now = Date.now();
		const listed = new Set(snapshots.map((snapshot) => snapshot.id));

		for (const snapshot of snapshots) {
			if (this.#timers.some((timer) => timer.rowId === snapshot.id)) continue;
			// A row this tab has just cancelled or paused: its DELETE is still in
			// flight, so a payload built before it landed still lists the row.
			if (this.#timers.some((timer) => timer.releasedRecently(snapshot.id, now))) continue;

			const timer = this.#make();
			timer.adopt(snapshot);
			this.#timers = [...this.#timers, timer];
		}

		for (const timer of [...this.#timers]) {
			if (timer.phase !== 'running' || timer.rowId === null) continue;
			if (listed.has(timer.rowId) || timer.remainingMs <= CLAIM_LEAD_MS) continue;
			// The snapshot predates the row — it cannot be evidence against it.
			if (timer.confirmedAt > fetchedAt) continue;
			this.#drop(timer);
		}

		if (this.#timers.length > 0) this.#startTicking();
	}

	#make(): CookTimer {
		// `#m` is checked by both callers; this keeps the constructor honest.
		const m = this.#m as Messages;

		return new CookTimer(
			m,
			(timer, message) => this.#drop(timer, message),
			() => this.#startTicking()
		);
	}

	/**
	 * Forget a machine. `message` is only ever passed by the one caller that has
	 * something to say — a start that was refused — so a cancel can't republish a
	 * warning the machine happened to still be carrying from ten minutes ago.
	 */
	#drop(timer: CookTimer, message?: string | null): void {
		if (message) this.lastError = message;

		this.#timers = this.#timers.filter((candidate) => candidate !== timer);
		if (this.#timers.length === 0) this.#stopTicking();
	}

	/**
	 * Sign-out, on the same tab. The machines belong to the person who started
	 * them: leaving them running would beep on the login screen (nothing stops
	 * the interval otherwise) and hand the next member to sign in on this tablet
	 * a dock pointing into somebody else's recipe.
	 */
	reset(): void {
		this.#stopTicking();
		this.#timers = [];
		this.lastError = null;
		this.#m = null;
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
		const now = Date.now();
		for (const timer of this.#timers) timer.tick(now);

		// Nothing left that counts down — a held or already-rung timer needs no
		// clock. Resuming one calls `#wake()`, which starts this again.
		if (!this.#timers.some((timer) => timer.phase === 'running')) this.#stopTicking();
	}
}

/** The app's timers. A singleton because they outlive cook mode. */
export const cookTimers = new CookTimers();
