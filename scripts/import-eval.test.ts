/**
 * `npm run import:eval` (→ plan 44, DECISIONS #318) against the fake provider:
 * the pipeline runs a fixture through, the numbers are counted, the table
 * prints. What it says about a real model needs a key no session has had.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import * as adapters from '../src/lib/server/ai/index';
import * as importer from '../src/lib/server/recipe-import';
import * as ai from '../src/lib/server/services/ai-import';
import { evalPage, evalTable, fakeAdapters, inventedRows, scoreDraft } from './import-eval';

const modules = { importer, ai, adapters };
const fake = { provider: 'gemini' as const, model: 'fake', apiKey: 'fake' };

describe('import:eval against the fake provider', () => {
	it('runs a card page through and counts every line covered, nothing invented', async () => {
		const { row, answer } = await evalPage(modules, 'gutekueche-lasagne', fake, fakeAdapters(), {
			url: 'https://www.gutekueche.at/lasagne-bolognese-rezept-3999',
			parts: ['Bechamel', 'Bolognese']
		});
		assert.equal(row.error, undefined);
		assert.deepEqual(row.lines, [22, 22]);
		assert.equal(row.invented, 0);
		assert.deepEqual(row.parts, [2, 2]);
		assert.deepEqual(row.steps, [7, 7]);
		assert.ok(answer);
	});

	it('reports a page the pipeline refused, instead of stopping', async () => {
		const { row } = await evalPage(modules, 'eat-this-good-life-bowl', fake, fakeAdapters(), {
			url: 'https://www.eat-this.org/'
		});
		assert.match(row.error ?? '', /bad-output/);
	});

	it('counts rows that name no card line as invented', () => {
		const answer = { ingredients: [{ source: 0 }, { source: 5 }, { source: null }, {}] };
		assert.equal(inventedRows(answer, 3), 3);
		assert.equal(inventedRows(answer, null), 0);
	});

	it('prints one row per page and a totals row, labelled with what answered', () => {
		const row = scoreDraft(
			'x',
			{
				name: 'x',
				timeMinutes: null,
				servings: 2,
				ingredientLines: ['1 Ei', 'Salz'],
				ingredientDetails: [{ note: null, section: 'Teig' }, null],
				steps: [{ text: 'Ei salzen.', uses: [{ ingredient: 0, quantity: null }], timer: null }],
				checks: [
					{ kind: 'amount-differs', level: 'check', at: { ingredient: 0 } },
					{ kind: 'unused', level: 'info', at: { ingredient: 1 } }
				]
			},
			2,
			1,
			{ url: 'https://x', parts: ['Teig', 'Fülle'], unused: ['Salz'] }
		);
		assert.deepEqual(row.amounts, [1, 2]);
		assert.deepEqual(row.parts, [1, 2]);
		assert.deepEqual(row.linked, [1, 1]);
		assert.equal(row.checks, 1);

		const table = evalTable([row], 'the fake provider (no real model)');
		assert.match(table, /^Import eval: the fake provider \(no real model\)$/m);
		assert.match(table, /^\| x \| 2\/2 \| 1 \| 1\/2 \| 2\/2 \| 1\/2 \| 1\/1 \| 1\/1 \| 1 \|$/m);
		assert.match(table, /^\| \*\*All\*\* \| 100 % \| 1 \| 50 % .* median 1 \|$/m);
	});
});
