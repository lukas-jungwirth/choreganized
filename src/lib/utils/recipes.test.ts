/**
 * The recipe form's step timer on the wire (→ plan 21, DECISIONS #147).
 *
 * `stepTimer` is a hidden field, i.e. a POST body like any other: a hand-rolled
 * request owes nothing to the form that usually sends it. So everything that
 * isn't a timer cook mode could run reads as "no timer" — never as an error,
 * and never as a step that can't be saved.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { readStepTimer } from './recipes';
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS, TIMER_LABEL_MAX } from './timer-parse';

describe('readStepTimer', () => {
	it('reads what the form posts', () => {
		assert.deepEqual(readStepTimer('{"seconds":600,"label":"Nudeln"}'), {
			seconds: 600,
			label: 'Nudeln'
		});
		assert.deepEqual(readStepTimer('{"seconds":90,"label":null}'), { seconds: 90, label: null });
	});

	it('treats an empty field as a step that reads its own text', () => {
		assert.equal(readStepTimer(''), null);
		assert.equal(readStepTimer(undefined), null);
	});

	it('trims and caps a name, and calls a blank one "after its step"', () => {
		assert.deepEqual(readStepTimer('{"seconds":60,"label":"  Reis \\n kochen  "}'), {
			seconds: 60,
			label: 'Reis kochen'
		});
		assert.equal(readStepTimer('{"seconds":60,"label":"   "}')?.label, null);
		assert.equal(
			readStepTimer(JSON.stringify({ seconds: 60, label: 'x'.repeat(500) }))?.label?.length,
			TIMER_LABEL_MAX
		);
		assert.equal(readStepTimer('{"seconds":60,"label":42}')?.label, null);
	});

	it('refuses a length cook mode could never run, without refusing the step', () => {
		for (const seconds of [
			0,
			-60,
			MIN_TIMER_SECONDS - 1,
			MAX_TIMER_SECONDS + 1,
			1e12,
			1.5,
			Number.NaN
		]) {
			assert.equal(readStepTimer(JSON.stringify({ seconds })), null, String(seconds));
		}
		assert.equal(readStepTimer('{"seconds":"600"}'), null);
		assert.deepEqual(readStepTimer(JSON.stringify({ seconds: MAX_TIMER_SECONDS })), {
			seconds: MAX_TIMER_SECONDS,
			label: null
		});
	});

	it('reads garbage as no timer', () => {
		for (const value of ['not json', '[600]', 'null', '600', '{"label":"Reis"}', '{']) {
			assert.equal(readStepTimer(value), null, value);
		}
	});
});
