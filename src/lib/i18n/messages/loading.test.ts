/**
 * The lines `AiCookingLoader` cycles through while the model reads a recipe.
 * "Chopping the words…" / „Wörter werden gehackt…" read as odd rather than
 * playful to the household, so it went (issue #48); the two languages keep the
 * same rotation so neither shows a line the other lacks.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { de } from './de.ts';
import { en } from './en.ts';

describe('AI import loader phrases', () => {
	it('no longer chops the words, in either language', () => {
		assert.ok(!en.cooking.import.ai.loading.some((line) => /chopping the words/i.test(line)));
		assert.ok(!de.cooking.import.ai.loading.some((line) => /wörter werden gehackt/i.test(line)));
	});

	it('cycles the same number of lines in both languages', () => {
		assert.equal(de.cooking.import.ai.loading.length, en.cooking.import.ai.loading.length);
		assert.equal(en.cooking.import.ai.loading.length, 4);
	});
});
