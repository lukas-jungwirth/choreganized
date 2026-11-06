/**
 * The noise a timer makes on the device you're holding (→ SPEC §4.6, DECISIONS
 * #134, #251).
 *
 * Three rising wooden notes, every few seconds, until somebody stops it. It has
 * been wrong in both directions. Three polite sine beeps lost every argument
 * with an extractor fan (#134), and the square-wave alarm that replaced them
 * carried fine but was frightening (#251). So the notes are struck and fade like
 * a marimba, with the overtones that cut through a fan, and it starts quietly
 * and swells to full volume, so the cook is called rather than startled.
 *
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
 * whole thing at once — including the round already scheduled ahead of the
 * clock, which is otherwise a second of notes *after* the tap that stopped it.
 */
let master: GainNode | null = null;
let roundLoop: ReturnType<typeof setInterval> | null = null;
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

/**
 * The phrase: seconds into the round, and the note. G5, C6, E6, a major chord
 * walking upwards, which reads as "ready" where the old alternating fifth read
 * as "emergency". All high enough for a phone speaker, which has no low end.
 */
const NOTES: ReadonlyArray<readonly [number, number]> = [
	[0, 784],
	[0.19, 1047],
	[0.38, 1319]
];
/**
 * What one struck note is made of: a multiple of the note, how loud, and how
 * many seconds it takes to fade. The ratios are a marimba bar's. The quick high
 * ones are the knock of the mallet, and they are what carries over a fan.
 */
const PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
	[1, 1, 0.5],
	[4, 0.28, 0.14],
	[9.2, 0.06, 0.05]
];
/**
 * One note at its loudest. A round of three peaks at 0.88 when rendered, close to
 * the top without clipping, because a phone speaker and a fan need all of it.
 */
const NOTE_LEVEL = 0.7;
const STRIKE_SECONDS = 0.006;
/**
 * How often the phrase repeats. It is over in under a second, so most of this is
 * room to talk across, and to think "oh, the rice".
 */
const ROUND_MS = 3200;
/** It starts here and reaches full volume after `RISE_SECONDS`. */
const START_LEVEL = 0.3;
const RISE_SECONDS = 20;

/** How long it keeps going with nobody stopping it (→ the module comment). */
const MAX_RING_MS = 60_000;

/** Android haptics, re-issued per round — one call replaces the last pattern. */
const VIBRATE = [200, 120, 200];

/** Start ringing, and keep ringing until `stopAlarm` or `MAX_RING_MS`. */
export function ringAlarm(): void {
	// A second timer reaching zero restarts the window rather than inheriting
	// what is left of the first one's: it has its own thing to say.
	stopAlarm();

	round();
	roundLoop = setInterval(round, ROUND_MS);
	giveUp = setTimeout(stopAlarm, MAX_RING_MS);
}

/** Silence it — the cook has seen it, or it has been going long enough. */
export function stopAlarm(): void {
	if (roundLoop !== null) {
		clearInterval(roundLoop);
		roundLoop = null;
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

	// Ramped, not cut: a gain that drops to zero mid-note is a click, and a click
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

/** One round of the phrase, plus the buzz that goes with it. */
function round(): void {
	vibrate();

	if (!context || context.state !== 'running') return;

	try {
		// The *first* round is what creates the node the whole alarm hangs off, so
		// `stopAlarm` has one thing to pull, and so the swell runs across all of them.
		if (!master) {
			master = context.createGain();
			master.gain.setValueAtTime(START_LEVEL, context.currentTime);
			master.gain.linearRampToValueAtTime(1, context.currentTime + RISE_SECONDS);
			master.connect(context.destination);
		}

		for (const [offset, note] of NOTES) strike(context, master, note, context.currentTime + offset);
	} catch {
		// An audio graph that won't build is not a reason to skip the vibration.
	}
}

/** One note: every partial jumps up at once, then each fades at its own speed. */
function strike(audio: AudioContext, output: AudioNode, note: number, at: number): void {
	for (const [ratio, level, fade] of PARTIALS) {
		const oscillator = audio.createOscillator();
		const gain = audio.createGain();

		oscillator.type = 'sine';
		oscillator.frequency.value = note * ratio;

		gain.gain.setValueAtTime(0, at);
		gain.gain.linearRampToValueAtTime(NOTE_LEVEL * level, at + STRIKE_SECONDS);
		// Exponential is how a struck thing fades, and it can't aim at zero itself.
		gain.gain.exponentialRampToValueAtTime(0.0001, at + fade);

		oscillator.connect(gain).connect(output);
		oscillator.start(at);
		oscillator.stop(at + fade + 0.02);
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
