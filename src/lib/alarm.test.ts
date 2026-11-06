/**
 * What the alarm is made of (→ DECISIONS #251). Nobody can hear a unit test, so
 * this pins the properties that made the old one frightening: buzzing square
 * waves, at full volume from the first note, every second and a half.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { primeAlarm, ringAlarm, stopAlarm } from './alarm';

type Call = { at: number; value: number };

class FakeParam {
	value = 0;
	calls: Call[] = [];
	setValueAtTime(value: number, at: number) {
		this.calls.push({ at, value });
	}
	linearRampToValueAtTime(value: number, at: number) {
		this.calls.push({ at, value });
	}
	exponentialRampToValueAtTime(value: number, at: number) {
		this.calls.push({ at, value });
	}
	cancelScheduledValues() {}
}

class FakeNode {
	connect<T>(next: T): T {
		return next;
	}
	disconnect() {}
}

class FakeGain extends FakeNode {
	gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
	type = '';
	frequency = new FakeParam();
	start() {}
	stop() {}
}

let gains: FakeGain[];
let oscillators: FakeOscillator[];

class FakeContext {
	state = 'running';
	currentTime = 0;
	destination = new FakeNode();
	createGain() {
		const node = new FakeGain();
		gains.push(node);
		return node;
	}
	createOscillator() {
		const node = new FakeOscillator();
		oscillators.push(node);
		return node;
	}
}

describe('the alarm', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		gains = [];
		oscillators = [];
		vi.stubGlobal('AudioContext', FakeContext);
		primeAlarm();
		ringAlarm();
	});

	afterEach(() => {
		stopAlarm();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('is made of pure tones, with nothing that buzzes', () => {
		assert.ok(oscillators.length > 0);
		assert.ok(oscillators.every((oscillator) => oscillator.type === 'sine'));
	});

	it('starts quietly and swells to full volume', () => {
		const [start, top] = gains[0].gain.calls;

		assert.ok(start.value <= 0.4, `starts at ${start.value}`);
		assert.equal(top.value, 1);
		assert.ok(top.at >= 15, `reaches the top after ${top.at} s`);
	});

	it('leaves room between rounds, until it is stopped', () => {
		const oneRound = oscillators.length;

		vi.advanceTimersByTime(2000);
		assert.equal(oscillators.length, oneRound, 'quiet for two seconds');

		vi.advanceTimersByTime(1500);
		assert.equal(oscillators.length, oneRound * 2, 'then the next round');

		stopAlarm();
		vi.advanceTimersByTime(10_000);
		assert.equal(oscillators.length, oneRound * 2, 'and nothing after Stop');
	});
});
