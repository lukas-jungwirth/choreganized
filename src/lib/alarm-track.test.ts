/**
 * The file that rings a locked phone (→ DECISIONS #252). No test can lock a
 * phone, so this pins what the ring depends on: the alarm sits at exactly the
 * right place in a well-formed file, and only the phones it was heard on get one.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { AlarmTrack, buildTrack, MAX_WAIT_MS, startTrack } from './alarm-track';

vi.mock('./alarm', () => ({
	renderRing: async () => new Float32Array([0.5, -0.5])
}));

const RING = new Uint8Array([1, 2, 3, 4]);

async function bytes(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer());
}

describe('buildTrack', () => {
	it('is a WAV file whose sizes add up', async () => {
		const file = await buildTrack(RING, 1000).arrayBuffer();
		const view = new DataView(file);
		const text = (at: number, length: number) =>
			String.fromCharCode(...new Uint8Array(file, at, length));

		assert.equal(text(0, 4), 'RIFF');
		assert.equal(text(8, 8), 'WAVEfmt ');
		assert.equal(view.getUint32(24, true), 16_000);
		assert.equal(view.getUint32(40, true), 32_004);
		assert.equal(view.getUint32(4, true), file.byteLength - 8);
		assert.equal(file.byteLength, 44 + 32_000 + 4);
	});

	it('puts the ring exactly where the wait ends, after nothing but silence', async () => {
		const file = await bytes(buildTrack(RING, 250));
		const wait = file.subarray(44, -4);

		assert.equal(wait.length, 8000);
		assert.ok(wait.every((byte) => byte === 0));
		assert.deepEqual([...file.subarray(-4)], [...RING]);
	});

	it('keeps its length across the chunks a long wait is made of', () => {
		const minutes = 5;
		const silence = minutes * 60 * 32_000;

		assert.equal(buildTrack(RING, minutes * 60_000).size, 44 + silence + RING.length);
	});
});

describe('startTrack', () => {
	let played: FakeAudio[];
	let refuse: boolean;

	class FakeAudio {
		paused = true;
		src = '';
		constructor() {
			played.push(this);
		}
		addEventListener() {}
		removeAttribute() {
			this.src = '';
		}
		pause() {
			this.paused = true;
		}
		play() {
			if (refuse) return Promise.reject(new Error('NotAllowedError'));
			this.paused = false;
			return Promise.resolve();
		}
	}

	function onPhone(userAgent: string) {
		vi.stubGlobal('navigator', { userAgent });
	}

	beforeEach(() => {
		played = [];
		refuse = false;
		vi.stubGlobal('Audio', FakeAudio);
		vi.stubGlobal('OfflineAudioContext', class {});
		URL.createObjectURL = () => 'blob:track';
		URL.revokeObjectURL = () => {};
		onPhone('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const soon = () => Date.now() + 60_000;
	const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

	it('plays on Android, and stops when told', async () => {
		const track = startTrack(soon());
		assert.ok(track instanceof AlarmTrack);
		await settled();

		assert.equal(played[0].src, 'blob:track');
		assert.equal(played[0].paused, false);
		assert.equal(track.playing, true);

		track.stop();
		assert.equal(played[0].paused, true);
		assert.equal(track.playing, false);
	});

	it('leaves other phones to the alarm and the push, where it has not been heard', () => {
		onPhone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1');
		assert.equal(startTrack(soon()), null);

		onPhone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130');
		assert.equal(startTrack(soon()), null);
	});

	it('has nothing to play past zero, or for a wait too long to hold', () => {
		assert.equal(startTrack(Date.now() - 1000), null);
		assert.equal(startTrack(Date.now() + MAX_WAIT_MS + 60_000), null);
		assert.ok(startTrack(Date.now() + MAX_WAIT_MS - 60_000));
	});

	it('counts as not playing when there was no tap to start it, so a live page rings instead', async () => {
		refuse = true;
		const track = startTrack(soon());
		await settled();

		assert.equal(track?.playing, false);
	});

	it('never plays once stopped, even if the ring was still being rendered', async () => {
		const track = startTrack(soon());
		track?.stop();
		await settled();

		assert.equal(played[0].paused, true);
		assert.equal(played[0].src, '');
	});
});
