/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 *
 * Worth having as tests rather than as a walkthrough: the whole point of the
 * parser is the sentences it must *not* find a timer in, and the only way to
 * see those in a running app is to type each one into a recipe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_TIMER_SECONDS, formatDuration, parseStepDuration } from './timer-parse.ts';

describe('parseStepDuration', () => {
	it('reads the spellings a recipe uses', () => {
		assert.equal(parseStepDuration('Sauté for 8 min'), 480);
		assert.equal(parseStepDuration('Sauté for 8 minutes'), 480);
		assert.equal(parseStepDuration('Sauté for 8 mins'), 480);
		assert.equal(parseStepDuration('Rest 30 seconds'), 30);
		assert.equal(parseStepDuration('Rest 30 secs'), 30);
		assert.equal(parseStepDuration('Chill for 1 h'), 3600);
		assert.equal(parseStepDuration('Chill for 1 hour'), 3600);
		assert.equal(parseStepDuration('Chill for 2 hrs'), 7200);
	});

	it('does not need a space before the unit', () => {
		assert.equal(parseStepDuration('Simmer 20min, stirring'), 1200);
		assert.equal(parseStepDuration('Prove 2h in a warm place'), 7200);
	});

	it('takes the first value of a range', () => {
		assert.equal(parseStepDuration('Sauté 8–10 min'), 480);
		assert.equal(parseStepDuration('Sauté 8-10 minutes'), 480);
		assert.equal(parseStepDuration('Sauté 8 to 10 minutes'), 480);
		assert.equal(parseStepDuration('Bake 25 or 30 min'), 1500);
	});

	it('reads a clock face', () => {
		assert.equal(parseStepDuration('Set a 8:00 timer'), 480);
		assert.equal(parseStepDuration('Steam for 2:30'), 150);
		assert.equal(parseStepDuration('Boil 12:00 exactly'), 720);
	});

	it('takes whichever duration comes first', () => {
		assert.equal(parseStepDuration('Set 8:00, then rest 5 min'), 480);
		assert.equal(parseStepDuration('Bake 20 min (a 20:00 timer)'), 1200);
	});

	it('adds minutes that follow hours immediately', () => {
		assert.equal(parseStepDuration('Braise 1 h 30 min'), 5400);
		assert.equal(parseStepDuration('Braise 1 hour and 30 minutes'), 5400);
	});

	it('keeps two instructions apart', () => {
		// A comma is a second instruction, not the tail of the first.
		assert.equal(parseStepDuration('Chill 1 hour, then bake 30 minutes'), 3600);
		// Minutes take no tail at all — "30" here is a weight.
		assert.equal(parseStepDuration('Simmer 8 min 30 g butter'), 480);
	});

	it('handles decimals written either way', () => {
		assert.equal(parseStepDuration('Rest 1.5 hours'), 5400);
		assert.equal(parseStepDuration('Rest 1,5 h'), 5400);
	});

	it('says nothing when the step is just cooking', () => {
		assert.equal(parseStepDuration('Season well and serve'), null);
		assert.equal(parseStepDuration(''), null);
		// A bare number is never a duration.
		assert.equal(parseStepDuration('Cut into 8 pieces'), null);
		assert.equal(parseStepDuration('Serves 4'), null);
	});

	it('does not mistake an oven for a timer', () => {
		assert.equal(parseStepDuration('Preheat the oven to 200°C'), null);
		assert.equal(parseStepDuration('Bake at 350°F for 25 minutes'), 1500);
	});

	it('does not read a single letter as a unit', () => {
		// `m` and `s` are lengths and typos far more often than durations.
		assert.equal(parseStepDuration('Roll to 5 m'), null);
		assert.equal(parseStepDuration('Add 2 s'), null);
		// …and `h` only counts as its own word.
		assert.equal(parseStepDuration('Mix 3 handfuls of spinach'), null);
	});

	it('is not fooled by a ratio', () => {
		assert.equal(parseStepDuration('Mix 1:1 flour and water'), null);
	});

	it('refuses durations outside a cooking day', () => {
		assert.equal(parseStepDuration('Ferment for 24 hours'), null);
		assert.equal(parseStepDuration('Rest 3 seconds'), null);
		assert.equal(parseStepDuration('Prove for 12 h'), MAX_TIMER_SECONDS);
	});
});

describe('formatDuration', () => {
	it('writes seconds as a clock', () => {
		assert.equal(formatDuration(480), '8:00');
		assert.equal(formatDuration(347), '5:47');
		assert.equal(formatDuration(7), '0:07');
		assert.equal(formatDuration(0), '0:00');
	});

	it('grows an hours column when it needs one', () => {
		assert.equal(formatDuration(3600), '1:00:00');
		assert.equal(formatDuration(5400), '1:30:00');
	});

	it('never counts past zero', () => {
		assert.equal(formatDuration(-3), '0:00');
	});
});
