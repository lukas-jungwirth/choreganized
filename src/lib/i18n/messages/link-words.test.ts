/**
 * The link sheet quotes a link's words the way the language quotes (→ plan 46,
 * check-up): the row read “Zwiebelwürfel” in German too, under a heading that
 * said „Topf“ verknüpfen mit, because the marks were written in the component.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { catalog } from '../index';

describe('a link’s words, quoted', () => {
	it('uses each language’s own marks', () => {
		assert.equal(
			catalog('en').cooking.form.links.linkedWords('200 g Karotten'),
			'“200 g Karotten”'
		);
		assert.equal(
			catalog('de').cooking.form.links.linkedWords('200 g Karotten'),
			'„200 g Karotten“'
		);
	});
});
