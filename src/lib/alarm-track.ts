/**
 * The ring as an audio track, for a phone that is locked or on silent
 * (→ SPEC §4.6, DECISIONS #252).
 *
 * A page can't wake itself and a notification can't choose a sound, so nothing a
 * web app schedules can ring a silent phone. A song can: it plays on media
 * volume, which silent mode leaves alone, and it needs no page awake. So the tap
 * that starts a timer starts one long track, the whole wait in silence and then
 * the ring. Lukas tried it on his Android phone, locked and playing a podcast.
 * The podcast keeps going through the silence and only pauses when the ring
 * begins.
 *
 * **It shows as a media player**, because that is what it is to the phone. The
 * words on it are the timer's, and its pause button means Stop once it's ringing.
 *
 * **Android only**, because that is the only place it has been heard. Safari
 * takes over the audio when a track starts rather than when it gets loud, and
 * WebKit's tracker has years of trouble with audio in installed apps. Everything
 * else keeps the live alarm and the push.
 *
 * Silence still takes room in an uncompressed file, 32 KB a second, so past
 * `MAX_WAIT_MS` the file gets too big to ask a phone to hold, and a timer that long
 * gets the push. The silence is one chunk of zeros named many times over, so
 * building the file costs no JavaScript heap, though the browser still stores it.
 */
import { renderRing } from './alarm';

/** What the phone heard in the test. The notes all sit well below half of this. */
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const HEADER_BYTES = 44;
const SILENCE_CHUNK_BYTES = 1 << 20;

/** About 230 MB of file. A roast still fits; twelve hours would be 1.4 GB. */
export const MAX_WAIT_MS = 2 * 60 * 60 * 1000;

/** Rendered once, the first time a timer needs it. */
let ring: Promise<Uint8Array> | null = null;

function ringBytes(): Promise<Uint8Array> {
	ring ??= renderRing(SAMPLE_RATE).then(toPcm);
	return ring;
}

function toPcm(samples: Float32Array): Uint8Array {
	const bytes = new Uint8Array(samples.length * BYTES_PER_SAMPLE);
	const view = new DataView(bytes.buffer);
	samples.forEach((sample, index) => {
		const clamped = Math.max(-1, Math.min(1, sample));
		view.setInt16(index * BYTES_PER_SAMPLE, clamped * 0x7fff, true);
	});
	return bytes;
}

/** A WAV file: `waitMs` of silence, then the ring. */
export function buildTrack(pcm: Uint8Array, waitMs: number): Blob {
	const samples = Math.round((Math.max(0, waitMs) / 1000) * SAMPLE_RATE);
	const silence = samples * BYTES_PER_SAMPLE;
	const zeros = new Uint8Array(Math.min(SILENCE_CHUNK_BYTES, Math.max(silence, 1)));

	const parts: BlobPart[] = [wavHeader(silence + pcm.length)];
	for (let left = silence; left > 0; left -= zeros.length) {
		parts.push(left >= zeros.length ? zeros : zeros.subarray(0, left));
	}
	parts.push(pcm as BlobPart);

	return new Blob(parts, { type: 'audio/wav' });
}

function wavHeader(dataBytes: number): ArrayBuffer {
	const header = new ArrayBuffer(HEADER_BYTES);
	const view = new DataView(header);
	const text = (at: number, value: string) => {
		for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
	};

	text(0, 'RIFF');
	view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
	text(8, 'WAVEfmt ');
	view.setUint32(16, 16, true); // The size of this format block.
	view.setUint16(20, 1, true); // Plain PCM.
	view.setUint16(22, 1, true); // Mono.
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
	view.setUint16(32, BYTES_PER_SAMPLE, true);
	view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
	text(36, 'data');
	view.setUint32(40, dataBytes, true);

	return header;
}

/** One timer's track, from the tap until it is stopped or has played out. */
export class AlarmTrack {
	#audio = new Audio();
	#url: string | null = null;
	#stopped = false;

	constructor(pcm: Promise<Uint8Array>, endsAt: number) {
		this.#audio.addEventListener('ended', () => this.stop());

		void pcm.then(
			(bytes) => {
				if (this.#stopped) return;

				// Measured here, not at the tap: rendering the ring the first time
				// takes a moment, and the ring still has to land on the second.
				this.#url = URL.createObjectURL(buildTrack(bytes, endsAt - Date.now()));
				this.#audio.src = this.#url;
				this.#audio.play().catch(() => this.stop());
			},
			() => this.stop()
		);
	}

	/**
	 * Whether it is still going to make its noise. False once stopped, and when the
	 * system paused it, which leaves the live alarm to do the job if a page is awake.
	 */
	get playing(): boolean {
		return !this.#stopped && (!this.#url || !this.#audio.paused);
	}

	stop(): void {
		this.#stopped = true;
		this.#audio.pause();

		if (this.#url) URL.revokeObjectURL(this.#url);
		this.#url = null;
		this.#audio.removeAttribute('src');
	}
}

/** Only where it has been heard working; see the module comment. */
function supported(): boolean {
	return (
		typeof Audio !== 'undefined' &&
		typeof OfflineAudioContext !== 'undefined' &&
		/Android/i.test(navigator.userAgent)
	);
}

/**
 * Start a track ringing at `endsAt`, if this phone and this length allow one.
 * Call it from a tap: `play()` refuses otherwise, and the track then quietly stops.
 */
export function startTrack(endsAt: number): AlarmTrack | null {
	const waitMs = endsAt - Date.now();
	if (waitMs <= 0 || waitMs > MAX_WAIT_MS || !supported()) return null;

	try {
		return new AlarmTrack(ringBytes(), endsAt);
	} catch {
		return null;
	}
}

/* ── The media player ─────────────────────────────────────────────────────── */

function session(): MediaSession | null {
	return typeof navigator !== 'undefined' && 'mediaSession' in navigator
		? navigator.mediaSession
		: null;
}

/** The words on the phone's media player, in place of "Timer". */
export function setPlayer(title: string, subtitle: string): void {
	const media = session();
	if (!media || typeof MediaMetadata === 'undefined') return;

	media.metadata = new MediaMetadata({
		title,
		artist: subtitle,
		artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
	});
}

export function clearPlayer(): void {
	const media = session();
	if (media) media.metadata = null;
}

/**
 * What the player's buttons do. Pause means Stop on a ring. Before the ring it
 * does nothing, deliberately: a paused track is a timer that looks fine on screen
 * and would ring nobody, and the only reason to press it is by accident.
 */
export function setPlayerStop(stop: () => void): void {
	const media = session();
	if (!media) return;

	for (const action of ['pause', 'stop'] as const) {
		try {
			media.setActionHandler(action, stop);
		} catch {
			// An older browser that doesn't know this action. The others still work.
		}
	}
}
