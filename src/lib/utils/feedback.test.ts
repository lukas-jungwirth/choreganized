/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codeFenceFor, feedbackTitle, FEEDBACK_TITLE_MAX } from './feedback.ts';

describe('feedbackTitle', () => {
	it('takes the first line', () => {
		assert.equal(
			feedbackTitle('The list jumps to the top.\nEvery time.'),
			'The list jumps to the top.'
		);
	});

	it('collapses whitespace so a title stays one line', () => {
		assert.equal(feedbackTitle('  The   list \t jumps.  '), 'The list jumps.');
	});

	it('cuts a long first line to the cap, ellipsis included', () => {
		const title = feedbackTitle('x'.repeat(200));
		assert.equal(title.length, FEEDBACK_TITLE_MAX);
		assert.ok(title.endsWith('…'));
	});

	it('leaves a line exactly at the cap alone', () => {
		const line = 'y'.repeat(FEEDBACK_TITLE_MAX);
		assert.equal(feedbackTitle(line), line);
	});

	it('never returns an empty title — GitHub answers one with an unretryable 422', () => {
		assert.equal(feedbackTitle(''), 'No description');
		assert.equal(feedbackTitle('   \n  '), 'No description');
	});
});

describe('codeFenceFor', () => {
	it('uses three backticks when the report has none', () => {
		assert.equal(codeFenceFor('The list jumps to the top.'), '```');
	});

	it('outgrows the longest run in the body, so nothing closes the fence early', () => {
		assert.equal(codeFenceFor('a ```js block``` here'), '````');
		assert.equal(codeFenceFor('````'), '`````');
		assert.equal(codeFenceFor('one ` and then ``````'), '```````');
	});

	it('is not fooled by runs split across lines', () => {
		assert.equal(codeFenceFor('```\ncode\n```'), '````');
	});
});
