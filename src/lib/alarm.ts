/**
 * The noise a timer makes on the device you're holding (→ SPEC §4.6: "the open
 * page also alerts locally — sound optional, vibration via `navigator.vibrate`").
 *
 * Deliberately synthesised rather than an audio file: three beeps is 30 lines of
 * WebAudio and no asset to precache, decode or get wrong on a slow connection.
 *
 * The awkward part is autoplay policy. An `AudioContext` created without a user
 * gesture starts suspended, and the gesture that matters here happened minutes
 * ago — the tap that started the timer. So `primeAlarm()` is called *then*, from
 * inside the click, and the context stays warm until it's needed.
 */

/** One context for the page; creating one per beep leaks audio hardware. */
let context: AudioContext | null = null;

type WebAudioWindow = typeof globalThis & {
	AudioContext?: typeof AudioContext;
	webkitAudioContext?: typeof AudioContext;
};

/**
 * Call from the click that starts a timer. Everything after this is allowed to
 * make noise; without it the beep is silently dropped on mobile Safari.
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

/** Three rising beeps and a buzz — "come back to the kitchen". */
export function ringAlarm(): void {
	vibrate();
	beep();
}

/**
 * Android only in practice (iOS has never shipped `navigator.vibrate`), and
 * ignored without user activation on some browsers — hence the belt of a sound
 * and the braces of a push notification.
 */
function vibrate(): void {
	try {
		navigator.vibrate?.([200, 100, 200]);
	} catch {
		// Some browsers throw rather than return false. Not worth a word.
	}
}

/** Beep spacing — long enough to read as three, short enough to be one alert. */
const BEEPS = [0, 0.35, 0.7];
const BEEP_SECONDS = 0.18;
const BEEP_HZ = 880;

function beep(): void {
	if (!context || context.state !== 'running') return;

	try {
		for (const offset of BEEPS) {
			const at = context.currentTime + offset;
			const oscillator = context.createOscillator();
			const gain = context.createGain();

			oscillator.type = 'sine';
			oscillator.frequency.value = BEEP_HZ;

			// Ramped rather than switched: a square-edged gain change is a click, and
			// three clicks is what a broken app sounds like.
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(0.35, at + 0.02);
			gain.gain.linearRampToValueAtTime(0, at + BEEP_SECONDS);

			oscillator.connect(gain).connect(context.destination);
			oscillator.start(at);
			oscillator.stop(at + BEEP_SECONDS + 0.02);
		}
	} catch {
		// An audio graph that won't build is not a reason to skip the vibration.
	}
}
