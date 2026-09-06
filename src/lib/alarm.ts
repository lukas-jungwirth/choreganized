/**
 * The noise a timer makes on the device you're holding (→ SPEC §4.6, DECISIONS
 * #134).
 *
 * It is an **alarm, not a notification chime**: two tones alternating four times
 * a second and a half, over and over, until somebody stops it. Three polite
 * beeps was the v1 behaviour and it lost every argument with an extractor fan —
 * a sound you can miss from the next room is a sound that doesn't do this job.
 * The one who stops it is the cook: Stop on the ring, or the × on a bar or the
 * dock (→ `cook-timer.svelte.ts`, which calls `stopAlarm` the moment nothing is
 * ringing any more).
 *
 * It gives up on its own after `MAX_RING_MS`. An alarm nobody is home for should
 * not still be going when they get back — the notification is what waits.
 *
 * Deliberately synthesised rather than an audio file: an alarm is a few
 * oscillators and no asset to precache, decode or get wrong on a slow
 * connection.
 *
 * The awkward part is autoplay policy. An `AudioContext` created without a user
 * gesture starts suspended, and the gesture that matters here happened minutes
 * ago — the tap that started the timer. So `primeAlarm()` is called *then*, from
 * inside the click, and the context stays warm until it's needed.
 */

/** One context for the page; creating one per beep leaks audio hardware. */
let context: AudioContext | null = null;

/**
 * Everything the current alarm plays through, so `stopAlarm` can silence the
 * whole thing at once — including the burst already scheduled ahead of the
 * clock, which is otherwise a second of beeping *after* the tap that stopped it.
 */
let master: GainNode | null = null;
let burstLoop: ReturnType<typeof setInterval> | null = null;
let giveUp: ReturnType<typeof setTimeout> | null = null;

type WebAudioWindow = typeof globalThis & {
	AudioContext?: typeof AudioContext;
	webkitAudioContext?: typeof AudioContext;
};

/**
 * Call from the click that starts a timer. Everything after this is allowed to
 * make noise; without it the alarm is silently dropped on mobile Safari.
 */
export function primeAlarm(): void {
	try {
		const scope = globalThis as WebAudioWindow;
		const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
		if (!Ctor) return;

		context ??= new Ctor();
		// Suspended is the normal state after a tab has been backgrounded.
		if (context.state === 'suspended') void context.resume();
	} catch {
		// No audio. The vibration and the notification still land.
	}
}

/** The two notes it alternates — a fifth apart, which is what reads as "alarm". */
const TONES = [880, 1319];
/** Beeps per burst, and how they're spaced. Four is urgent; six is a fire alarm. */
const BEEPS = 4;
const BEEP_SECONDS = 0.14;
const BEEP_GAP = 0.08;
/**
 * How often a burst repeats. Long enough to leave a hole you can talk across,
 * short enough that it never sounds like it has finished and given up.
 */
const BURST_MS = 1500;
/**
 * Loud enough to carry over a fan, short of the clipping a square wave gets to
 * quickly. The filter below is what keeps it from being shrill at this level.
 */
const VOLUME = 0.5;
/** Takes the glassy top off the square wave without softening the attack. */
const FILTER_HZ = 2600;

/** How long it keeps going with nobody stopping it (→ the module comment). */
const MAX_RING_MS = 60_000;

/** Android haptics, re-issued per burst — one call replaces the last pattern. */
const VIBRATE = [400, 150, 400, 150, 400];

/** Start ringing, and keep ringing until `stopAlarm` or `MAX_RING_MS`. */
export function ringAlarm(): void {
	// A second timer reaching zero restarts the window rather than inheriting
	// what is left of the first one's: it has its own thing to say.
	stopAlarm();

	burst();
	burstLoop = setInterval(burst, BURST_MS);
	giveUp = setTimeout(stopAlarm, MAX_RING_MS);
}

/** Silence it — the cook has seen it, or it has been going long enough. */
export function stopAlarm(): void {
	if (burstLoop !== null) {
		clearInterval(burstLoop);
		burstLoop = null;
	}

	if (giveUp !== null) {
		clearTimeout(giveUp);
		giveUp = null;
	}

	try {
		navigator.vibrate?.(0);
	} catch {
		// Some browsers throw rather than return false. Not worth a word.
	}

	if (!master || !context) return;

	// Ramped, not cut: a gain that drops to zero mid-beep is a click, and a click
	// is what a broken app sounds like. Then dropped entirely, so the oscillators
	// still scheduled against it play into nothing and collect themselves.
	const node = master;
	master = null;

	try {
		const at = context.currentTime;
		node.gain.cancelScheduledValues(at);
		node.gain.setValueAtTime(node.gain.value, at);
		node.gain.linearRampToValueAtTime(0, at + 0.04);
		setTimeout(() => node.disconnect(), 100);
	} catch {
		node.disconnect();
	}
}

/** One "beep-beep-beep-beep", plus the buzz that goes with it. */
function burst(): void {
	vibrate();

	if (!context || context.state !== 'running') return;

	try {
		// One chain per burst is enough — but the *first* burst is what creates the
		// chain the whole alarm hangs off, so `stopAlarm` has one node to pull.
		if (!master) {
			master = context.createGain();
			master.gain.value = 1;

			const filter = context.createBiquadFilter();
			filter.type = 'lowpass';
			filter.frequency.value = FILTER_HZ;
			master.connect(filter).connect(context.destination);
		}

		for (let beep = 0; beep < BEEPS; beep++) {
			const at = context.currentTime + beep * (BEEP_SECONDS + BEEP_GAP);
			const oscillator = context.createOscillator();
			const gain = context.createGain();

			oscillator.type = 'square';
			oscillator.frequency.value = TONES[beep % TONES.length];

			// Ramped rather than switched, for the same reason `stopAlarm` ramps.
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(VOLUME, at + 0.015);
			gain.gain.setValueAtTime(VOLUME, at + BEEP_SECONDS - 0.03);
			gain.gain.linearRampToValueAtTime(0, at + BEEP_SECONDS);

			oscillator.connect(gain).connect(master);
			oscillator.start(at);
			oscillator.stop(at + BEEP_SECONDS + 0.02);
		}
	} catch {
		// An audio graph that won't build is not a reason to skip the vibration.
	}
}

/**
 * Android only in practice (iOS has never shipped `navigator.vibrate`), and
 * ignored without user activation on some browsers — hence the belt of a sound
 * and the braces of a push notification.
 */
function vibrate(): void {
	try {
		navigator.vibrate?.(VIBRATE);
	} catch {
		// Some browsers throw rather than return false. Not worth a word.
	}
}
