/**
 * The import review's answers (→ plan 45): each kind of check item settled on
 * a draft, as the screen does on a tap, and what Save then posts. The drafts
 * are the gate's own output for the Chefkoch fixture page
 * (`tests/fixtures/review-drafts/`, held to the gate by
 * `tests/integration/review-drafts.test.ts`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { flatten, keyMaker, postedFields } from './recipe-editor';
import {
	addUnitWord,
	chooseOther,
	draftKey,
	editBasics,
	editIngredient,
	editStepText,
	findIngredient,
	findStep,
	keep,
	notes,
	openChecks,
	putBack,
	readStored,
	removeAdded,
	removeIngredient,
	removeStep,
	setServings,
	startReview,
	stillLeftOut,
	useAnswer,
	usePageText,
	withoutEmptySteps,
	type ImportDraft,
	type Review
} from './recipe-review';
import type { RecipePrefill } from './recipes';

function load(name: string): ImportDraft {
	return JSON.parse(readFileSync(`tests/fixtures/review-drafts/${name}.json`, 'utf8'));
}

function open(name: string): Review {
	return startReview(load(name), keyMaker('t'));
}

const rows = (review: Review) => flatten(review.editor.ingredients).map(({ row }) => row);
const steps = (review: Review) => flatten(review.editor.steps).map(({ row }) => row);
const itemOf = (review: Review, kind: string) => {
	const found = review.items.find((item) => item.kind === kind);
	assert.ok(found, `an item of kind ${kind}`);
	return found;
};
const rowOf = (review: Review, kind: string) => {
	const found = findIngredient(review, itemOf(review, kind).ingredient);
	assert.ok(found);
	return found.row;
};

/** What Save posts for the review's rows and steps, as `readRecipeForm` reads it back. */
function posted(review: Review, name: string): string[] {
	return postedFields(review.editor)
		.filter(([field]) => field === name)
		.map(([, value]) => value);
}

describe('opening a draft', () => {
	it('puts each item on the row or step its index named', () => {
		const review = open('kinds');
		assert.equal(rowOf(review, 'amount-differs').name, 'Rinderhackfleisch');
		assert.equal(rowOf(review, 'choice').name, 'Rotwein');
		assert.equal(rowOf(review, 'line-added').name, 'Thymian');
		assert.equal(rowOf(review, 'new-unit').name, 'Mozzarella');
		const step = findStep(review, itemOf(review, 'reworded').step);
		assert.equal(step?.number, 3);
		assert.match(step?.step.text ?? '', /^Das Faschierte dazugeben/);
	});

	it('counts the open questions, and a clean draft has none', () => {
		assert.equal(openChecks(open('lasagne')).length, 2);
		assert.equal(openChecks(open('kinds')).length, 6);
		assert.equal(openChecks(open('clean')).length, 0);
	});

	it('keeps the parts, notes and links the gate made', () => {
		const review = open('lasagne');
		assert.deepEqual(
			review.editor.ingredients.map((part) => part.name),
			['Bolognesesoße', 'Béchamelsoße']
		);
		assert.equal(
			rows(review).find((row) => row.name === 'Speck')?.note,
			'geräuchert, durchwachsen'
		);
		assert.ok(steps(review).every((step) => !step.suggest));
	});

	it('has no empty step for a page with no method', () => {
		const review = open('no-method');
		assert.deepEqual(review.editor.steps, []);
		assert.deepEqual(posted(review, 'step'), []);
	});

	it('quiet items fold away, and a row no step uses is one', () => {
		const review = open('lasagne');
		assert.ok(notes(review).every((item) => item.level === 'info'));
	});
});

describe('settling each kind with one tap', () => {
	it('choice: untouched, the first is saved with the other in the note', () => {
		const review = keep(open('lasagne'), itemOf(open('lasagne'), 'choice').id);
		const wine = rowOf(review, 'choice');
		assert.equal(wine.name, 'Rotwein');
		assert.equal(wine.note, 'oder Gemüsebrühe');
		assert.equal(openChecks(review).length, 1);
	});

	it('choice: the other one names the row, and the first goes to the note', () => {
		const start = open('lasagne');
		const review = chooseOther(start, itemOf(start, 'choice').id);
		const row = rowOf(review, 'choice');
		assert.equal(row.name, 'Gemüsebrühe');
		assert.equal(row.note, 'oder Rotwein');
		assert.ok(itemOf(review, 'choice').settled);
	});

	it('choice: a note that said more keeps the rest', () => {
		const start = open('lasagne');
		const id = itemOf(start, 'choice').ingredient!;
		const noted = {
			...start,
			editor: {
				...start.editor,
				ingredients: start.editor.ingredients.map((part) => ({
					...part,
					rows: part.rows.map((row) =>
						row.id === id ? { ...row, note: 'oder Gemüsebrühe, trocken' } : row
					)
				}))
			}
		};
		const row = rowOf(chooseOther(noted, itemOf(noted, 'choice').id), 'choice');
		assert.equal(row.note, 'oder Rotwein, trocken');
	});

	it('amount-differs: the page’s stands untouched; "use the other" takes the model’s', () => {
		const start = open('lasagne');
		const item = itemOf(start, 'amount-differs');
		assert.deepEqual(item.answer, { quantity: 50, unit: 'g' });
		assert.equal(rowOf(start, 'amount-differs').quantity, 500);

		const used = useAnswer(start, item.id);
		assert.equal(rowOf(used, 'amount-differs').quantity, 50);
		assert.equal(rowOf(used, 'amount-differs').unit, 'g');
		assert.ok(itemOf(used, 'amount-differs').settled);
	});

	it('name-differs: keep settles it, an edit of the row does too', () => {
		const start = open('kinds');
		const item = itemOf(start, 'name-differs');
		assert.equal(rowOf(start, 'name-differs').name, 'Zwiebel');
		assert.ok(itemOf(keep(start, item.id), 'name-differs').settled);

		const row = rowOf(start, 'name-differs');
		const edited = editIngredient(
			start,
			row.id,
			{ ...row, name: 'Zwiebel, rot' },
			'Bolognesesoße',
			keyMaker('e'),
			true
		);
		assert.equal(rowOf(edited, 'name-differs').name, 'Zwiebel, rot');
		assert.ok(itemOf(edited, 'name-differs').settled);
	});

	it('line-added: remove takes the row out, and every link to it', () => {
		const start = open('kinds');
		const id = itemOf(start, 'line-added').ingredient!;
		assert.ok(steps(start).some((step) => step.links.some((link) => link.ingredient === id)));

		const removed = removeAdded(start, itemOf(start, 'line-added').id);
		assert.equal(findIngredient(removed, id), null);
		assert.ok(!steps(removed).some((step) => step.links.some((link) => link.ingredient === id)));
		assert.equal(openChecks(removed).length, 5);
	});

	it('reworded: the page’s text replaces the step, and a link whose words are gone keeps its row', () => {
		const start = open('kinds');
		const item = itemOf(start, 'reworded');
		const review = usePageText(start, item.id);
		const step = findStep(review, item.step)!.step;
		assert.equal(step.text, item.page);
		assert.equal(step.opened, item.page);
		assert.ok(itemOf(review, 'reworded').settled);
		for (const link of step.links) {
			if (link.phrase) assert.ok(step.text.includes(link.phrase), link.phrase);
		}
	});

	it('new-unit: added, the row counts in it and the note loses it; kept, it stays in the note', () => {
		const start = open('kinds');
		const item = itemOf(start, 'new-unit');
		assert.equal(rowOf(start, 'new-unit').unit, null);
		assert.equal(rowOf(start, 'new-unit').note, 'Kugeln');

		const added = addUnitWord(start, item.id, 'Kugeln');
		assert.equal(rowOf(added, 'new-unit').unit, 'Kugeln');
		assert.equal(rowOf(added, 'new-unit').note, null);
		assert.ok(itemOf(added, 'new-unit').settled);

		const kept = keep(start, item.id);
		assert.equal(rowOf(kept, 'new-unit').note, 'Kugeln');
		assert.equal(rowOf(kept, 'new-unit').unit, null);
	});

	it('servings: a count sets it and settles the question', () => {
		const start = open('no-method');
		assert.equal(start.servings, null);
		const review = setServings(start, 4);
		assert.equal(review.servings, 4);
		assert.ok(itemOf(review, 'servings').settled);
		// The basics sheet is the other way to the same answer.
		const sheet = editBasics(start, { name: start.name, timeMinutes: 100, servings: 2 });
		assert.ok(itemOf(sheet, 'servings').settled);
	});

	it('no-steps: saving without settles it and posts no step', () => {
		const start = open('no-method');
		const review = keep(start, itemOf(start, 'no-steps').id);
		assert.ok(itemOf(review, 'no-steps').settled);
		assert.deepEqual(posted(review, 'step'), []);
	});

	it('an item whose row is gone is no question', () => {
		const start = open('lasagne');
		const id = itemOf(start, 'amount-differs').ingredient!;
		assert.equal(openChecks(removeIngredient(start, id)).length, 1);
	});
});

describe('putting a left-out sentence back', () => {
	/** A draft of three steps, two sentences left out after step 1, one before step 1. */
	function small(): ImportDraft {
		const prefill: RecipePrefill = {
			name: 'Suppe',
			timeMinutes: null,
			servings: 2,
			ingredientLines: ['1 Karotte'],
			steps: ['Eins.', 'Zwei.', 'Drei.'].map((text) => ({ text, uses: [], timer: null })),
			photo: null,
			leftOut: [
				{ text: 'Vorab: Tipp.', after: -1 },
				{ text: 'Erster Tipp.', after: 0 },
				{ text: 'Zweiter Tipp.', after: 0 }
			]
		};
		return { prefill };
	}

	const texts = (review: Review) => steps(review).map((step) => step.text);

	it('puts it after the step it followed on the page', () => {
		const start = startReview(small(), keyMaker('s'));
		const id = start.leftOut[1].id;
		const review = putBack(start, id, keyMaker('p'));
		assert.deepEqual(texts(review), ['Eins.', 'Erster Tipp.', 'Zwei.', 'Drei.']);
		assert.equal(stillLeftOut(review).length, 2);
	});

	it('keeps the page’s order whichever is put back first', () => {
		const start = startReview(small(), keyMaker('s'));
		const key = keyMaker('p');
		const second = putBack(start, start.leftOut[2].id, key);
		const both = putBack(second, start.leftOut[1].id, key);
		assert.deepEqual(texts(both), ['Eins.', 'Erster Tipp.', 'Zweiter Tipp.', 'Zwei.', 'Drei.']);
	});

	it('a sentence from before the first step goes first', () => {
		const start = startReview(small(), keyMaker('s'));
		const review = putBack(start, start.leftOut[0].id, keyMaker('p'));
		assert.equal(texts(review)[0], 'Vorab: Tipp.');
	});

	it('a put-back step is offered its links, and removing it leaves the sentence out again', () => {
		const start = startReview(small(), keyMaker('s'));
		const review = putBack(start, start.leftOut[1].id, keyMaker('p'));
		const back = review.leftOut[1].back!;
		assert.ok(findStep(review, back)?.step.suggest);
		assert.equal(stillLeftOut(removeStep(review, back)).length, 3);
	});

	it('the Chefkoch variations go back at the end, in the page’s order', () => {
		const start = open('lasagne');
		const key = keyMaker('p');
		const review = start.leftOut.reduce((next, one) => putBack(next, one.id, key), start);
		assert.deepEqual(
			texts(review).slice(-start.leftOut.length),
			start.leftOut.map((one) => one.text)
		);
		assert.equal(stillLeftOut(review).length, 0);
	});
});

describe('editing one thing', () => {
	it('a step’s text edited settles what was asked about it', () => {
		const start = open('kinds');
		const item = itemOf(start, 'reworded');
		const review = editStepText(start, item.step!, 'Das Faschierte anbraten.');
		assert.equal(findStep(review, item.step)?.step.text, 'Das Faschierte anbraten.');
		assert.ok(itemOf(review, 'reworded').settled);
	});

	it('an empty text changes nothing', () => {
		const start = open('kinds');
		assert.equal(editStepText(start, itemOf(start, 'reworded').step!, '  '), start);
	});
});

describe('code-review fixes', () => {
	it('opening a row or a step and closing it unchanged answers nothing', () => {
		const start = open('kinds');
		const row = rowOf(start, 'name-differs');
		const { id: _id, ...fields } = row;
		const part = findIngredient(start, row.id)!.part;
		const looked = editIngredient(start, row.id, fields, part, keyMaker('e'), true);
		assert.equal(itemOf(looked, 'name-differs').settled, false);

		const step = findStep(start, itemOf(start, 'reworded').step)!.step;
		assert.equal(itemOf(editStepText(start, step.id, step.text), 'reworded').settled, false);
	});

	it('the editor’s empty step does not come back into the review', () => {
		const start = open('no-method');
		const typed = {
			...start.editor,
			steps: [{ id: 'p', name: null, rows: [{ ...steps(open('lasagne'))[0], text: '  ' }] }]
		};
		assert.deepEqual(withoutEmptySteps(typed).steps, []);
	});

	it('a sentence a reworded step offers is left out until that step takes it', () => {
		const start = open('kinds');
		const reworded = itemOf(start, 'reworded');
		const offered = (review: Review) =>
			stillLeftOut(review).some((one) => one.text.startsWith('Das Hackfleisch'));
		assert.ok(offered(start));
		assert.ok(!offered(usePageText(start, reworded.id)));
		assert.ok(offered(keep(start, reworded.id)));
	});

	it('a new unit word reads a step’s share of the row again', () => {
		const prefill: RecipePrefill = {
			name: 'Wurstsalat',
			timeMinutes: null,
			servings: 2,
			ingredientLines: ['2 Lyoner'],
			ingredientDetails: [{ note: 'Ringe', section: null }],
			steps: [
				{
					text: '1 Ring Lyoner in Streifen schneiden.',
					uses: [{ ingredient: 0, quantity: null, phrase: 'Lyoner', amountPhrase: '1 Ring' }],
					timer: null
				}
			],
			photo: null,
			checks: [
				{ kind: 'new-unit', level: 'check', at: { ingredient: 0 }, word: 'Ringe', name: 'Lyoner' }
			]
		};
		const start = startReview({ prefill }, keyMaker('w'));
		const added = addUnitWord(start, itemOf(start, 'new-unit').id, 'Ring');
		assert.equal(rowOf(added, 'new-unit').unit, 'Ring');
		assert.equal(steps(added)[0].links[0].quantity, 1);
	});

	it('"Use" the model’s amount gives back the unit word it wrote into the name', () => {
		const prefill: RecipePrefill = {
			name: 'Suppe',
			timeMinutes: null,
			servings: 2,
			ingredientLines: ['1 Bund Suppengrün'],
			steps: [],
			photo: null,
			checks: [
				{
					kind: 'amount-differs',
					level: 'check',
					at: { ingredient: 0 },
					page: '1 Bund Suppengrün',
					answer: { quantity: 2, unit: null, name: 'Bund Suppengrün' }
				}
			]
		};
		const start = startReview({ prefill }, keyMaker('b'));
		const used = useAnswer(start, itemOf(start, 'amount-differs').id);
		assert.equal(rowOf(used, 'amount-differs').name, 'Bund Suppengrün');
		assert.equal(rowOf(used, 'amount-differs').quantity, 2);
	});
});

describe('the stored draft', () => {
	it('has a key per import', () => {
		assert.equal(draftKey('abc'), 'recipe-import:abc');
	});

	it('reads back what was written, and nothing else', () => {
		const draft = load('lasagne');
		const stored = { v: 1, draft, review: startReview(draft, keyMaker('t')) };
		assert.deepEqual(readStored(JSON.stringify(stored)), stored);
		assert.equal(readStored(null), null);
		assert.equal(readStored('not json'), null);
		assert.equal(readStored(JSON.stringify({ v: 2, draft })), null);
		assert.equal(readStored(JSON.stringify({ v: 1, draft: { prefill: {} } })), null);
	});
});
