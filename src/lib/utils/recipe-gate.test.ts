/**
 * The import's gate against real pages (→ plan 44): a recorded answer for a
 * fixture page becomes a draft and its check items, and hand-written hostile
 * answers (an invented row, a changed amount, a reworded step, more than a
 * third reworded, a phrase that is not in the step, an amount phrase with the
 * wrong unit, a link past the end, a part the page never had, a dropped line)
 * are caught. The answers were written by hand: no session has had a provider
 * key (DECISIONS #318), so nothing here says how a real model does.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { readFetchedPage } from '../server/recipe-import';
import { validateRecipeDraft, type DraftContext, type SourceRecipe } from './recipe-draft';
import type { ImportCheck } from './recipes';

function page(fixture: string) {
	const html = readFileSync(`src/lib/utils/fixtures/${fixture}.html`, 'utf8');
	const read = readFetchedPage({ html, finalUrl: 'https://example.com/' });
	assert.ok(read.card, `${fixture} has a card`);
	return { card: read.card as SourceRecipe, text: read.text };
}

const chefkoch = page('chefkoch-lasagne');
const answer = JSON.parse(readFileSync('tests/fixtures/ai-answers/chefkoch-lasagne.json', 'utf8'));
const context: DraftContext = {
	source: chefkoch.card,
	text: chefkoch.text,
	instructed: false,
	labels: { tbsp: 'EL', tsp: 'TL', pcs: 'Stk.', pack: 'Pkg.' }
};

function draftOf(raw: unknown, extra: Partial<DraftContext> = {}) {
	const result = validateRecipeDraft(raw, { ...context, ...extra });
	assert.ok(result.ok, `expected a draft, got ${JSON.stringify(result)}`);
	return result.draft;
}

const kinds = (checks: ImportCheck[] | undefined) => (checks ?? []).map((check) => check.kind);
const copy = () => structuredClone(answer);

describe('the gate on the Chefkoch lasagne (a recorded answer)', () => {
	const draft = draftOf(answer);
	const details = draft.ingredientDetails ?? [];
	const row = (name: string, from = 0) =>
		draft.ingredientLines.findIndex((line, at) => at >= from && line.endsWith(` ${name}`));

	it('opens with two parts, over ingredients and steps', () => {
		const parts = [...new Set(details.map((one) => one?.section))];
		assert.deepEqual(parts, ['Bolognesesoße', 'Béchamelsoße']);
		assert.equal(draft.steps[0].section, 'Bolognesesoße');
		assert.equal(draft.steps[5].section, 'Béchamelsoße');
	});

	it('keeps the name clean and the rest in the note: Speck · geräuchert, durchwachsen', () => {
		const at = row('Speck');
		assert.equal(draft.ingredientLines[at], '100 g Speck');
		assert.equal(details[at]?.note, 'geräuchert, durchwachsen');
	});

	it('has one Salz and one Pfeffer row in the Bolognesesoße, as the page lists them', () => {
		const salz = draft.ingredientLines.filter((line) => line === 'Salz');
		const pfeffer = draft.ingredientLines.filter((line) => line === 'Pfeffer');
		assert.equal(salz.length, 1);
		assert.equal(pfeffer.length, 1);
		assert.equal(details[draft.ingredientLines.indexOf('Salz')]?.section, 'Bolognesesoße');
	});

	it('links "Zwiebelwürfel" to the Béchamel’s onion', () => {
		const onion = row('Zwiebeln', 13);
		const step = draft.steps[5];
		assert.ok(
			step.uses?.some((use) => use.ingredient === onion && use.phrase === 'Zwiebelwürfel'),
			JSON.stringify(step.uses)
		);
	});

	it('reads counting words and offers the either/or as a choice', () => {
		assert.equal(draft.ingredientLines[row('Knoblauch')], '2 Zehen Knoblauch');
		assert.equal(draft.ingredientLines[row('Suppengrün')], '1 Bund Suppengrün');
		const wine = row('Rotwein');
		assert.equal(details[wine]?.note, 'oder Gemüsebrühe');
		assert.deepEqual(
			draft.checks?.filter((check) => check.kind === 'choice'),
			[
				{
					kind: 'choice',
					level: 'check',
					alternative: 'Gemüsebrühe',
					name: 'Rotwein',
					at: { ingredient: wine }
				}
			]
		);
	});

	it('keeps the variations it left out, and asks about nothing else', () => {
		assert.ok(draft.leftOut?.some((sentence) => sentence.text.startsWith('Variationen:')));
		assert.ok(
			draft.leftOut?.some((sentence) => sentence.text.startsWith('Anstelle der Hackfleischsoße'))
		);
		assert.deepEqual(
			draft.checks?.filter((check) => check.level === 'check').map((check) => check.kind),
			['choice']
		);
	});

	it('keeps the card’s facts and the model’s shortening of its name', () => {
		assert.equal(draft.name, 'Lasagne alla Bolognese mit Béchamelsoße');
		assert.equal(draft.servings, 6);
		assert.equal(draft.timeMinutes, 100);
	});
});

describe('the gate on hostile answers', () => {
	it('drops an invented row', () => {
		const raw = copy();
		raw.ingredients.push({ ...raw.ingredients[0], source: null, name: 'Trüffel' });
		raw.ingredients.push({ ...raw.ingredients[0], source: 99, name: 'Kaviar' });
		const draft = draftOf(raw);
		assert.ok(!draft.ingredientLines.some((line) => /Trüffel|Kaviar/.test(line)));
	});

	it('opens a changed amount with the page’s, and says so ("500 g" made "50 g")', () => {
		const raw = copy();
		raw.ingredients[5].quantity = 50;
		const draft = draftOf(raw);
		assert.equal(draft.ingredientLines[5], '500 g Rinderhackfleisch');
		assert.deepEqual(
			draft.checks?.find((check) => check.kind === 'amount-differs'),
			{
				kind: 'amount-differs',
				level: 'check',
				page: '500 g Rinderhackfleisch',
				// What the model said, for the review's "Use 50 g" (→ plan 45).
				answer: { quantity: 50, unit: 'g' },
				name: 'Rinderhackfleisch',
				at: { ingredient: 5 }
			}
		);
	});

	it('keeps the model’s name with its amount when its unit stood in the name (→ plan 45)', () => {
		const raw = copy();
		Object.assign(raw.ingredients[0], { quantity: 2, countingWord: null, name: 'Bund Suppengrün' });
		const draft = draftOf(raw);
		assert.equal(draft.ingredientLines[0], '1 Bund Suppengrün');
		assert.deepEqual(draft.checks?.find((check) => check.kind === 'amount-differs')?.answer, {
			quantity: 2,
			unit: null,
			name: 'Bund Suppengrün'
		});
	});

	it('says where each left-out sentence stood: after the step before it (→ plan 45)', () => {
		const draft = draftOf(answer);
		const variations = draft.leftOut?.find((one) => one.text.startsWith('Variationen:'));
		assert.ok(variations);
		// The last step the page had before its variations is the draft's last.
		assert.equal(variations.after, draft.steps.length - 1);
		for (const one of draft.leftOut ?? []) {
			assert.ok(one.after >= -1 && one.after < draft.steps.length, JSON.stringify(one));
		}
	});

	it('takes the page’s words over a name that says something else', () => {
		const raw = copy();
		raw.ingredients[3].name = 'Schinken';
		const draft = draftOf(raw);
		assert.equal(draft.ingredientLines[3], '100 g Speck');
		assert.ok(kinds(draft.checks).includes('name-differs'));
	});

	it('flags a reworded step and offers the page’s sentence', () => {
		const raw = copy();
		raw.steps[2].text = 'Das Faschierte dazugeben und schön braun anbraten.';
		const draft = draftOf(raw);
		const item = draft.checks?.find((check) => check.kind === 'reworded');
		assert.deepEqual(item?.at, { step: 2 });
		assert.match(item?.page ?? '', /Hackfleisch dazugeben/);
	});

	it('refuses an answer with more than a third of its steps reworded', () => {
		const raw = copy();
		for (const step of raw.steps.slice(0, 4)) step.text = `${step.text} Gut umrühren.`;
		assert.deepEqual(validateRecipeDraft(raw, context), { ok: false, reason: 'fidelity' });
	});

	it('clears a phrase that is not in its step, and keeps the link', () => {
		const raw = copy();
		raw.steps[0].uses[0].phrase = 'Wurzelgemüse';
		const draft = draftOf(raw);
		assert.deepEqual(
			draft.steps[0].uses?.find((use) => use.ingredient === 0),
			{
				ingredient: 0,
				quantity: null,
				phrase: null,
				amountPhrase: null
			}
		);
	});

	it('clears an amount phrase in the wrong unit, or more than the row', () => {
		const raw = copy();
		raw.steps[3].text = 'Mit 125 ml Rotwein oder Brühe ablöschen und verdampfen lassen.';
		raw.steps[3].uses[0].amountPhrase = '125 g';
		const text = raw.steps[3].text;
		const draft = draftOf(raw, {
			source: { ...chefkoch.card, steps: [text, ...chefkoch.card.steps] }
		});
		assert.equal(draft.steps[3].uses?.[0].amountPhrase, null);

		raw.steps[3].uses[0].amountPhrase = '125 ml';
		const kept = draftOf(raw, {
			source: { ...chefkoch.card, steps: [text, ...chefkoch.card.steps] }
		});
		const wine = kept.steps[3].uses?.find((use) => use.phrase === 'Rotwein');
		assert.equal(wine?.amountPhrase, '125 ml');
	});

	it('drops a link past the end', () => {
		const raw = copy();
		raw.steps[0].uses.push({ ingredient: 40, phrase: 'Speck', amountPhrase: null, quantity: null });
		const draft = draftOf(raw);
		assert.ok(draft.steps[0].uses?.every((use) => use.ingredient < draft.ingredientLines.length));
	});

	it('drops a part the page never had', () => {
		const raw = copy();
		raw.ingredients[0].section = 'Gremolata';
		raw.steps[0].section = 'Gremolata';
		const draft = draftOf(raw);
		// The card's own part for that line stands instead.
		assert.equal(draft.ingredientDetails?.[0]?.section, 'Sauce (Bolognesesoße)');
		assert.notEqual(draft.steps[0].section, 'Gremolata');
	});

	it('adds a page line the answer dropped, in its place, and says so', () => {
		const raw = copy();
		raw.ingredients.splice(10, 1); // Tomatenmark
		for (const step of raw.steps) {
			step.uses = step.uses
				.filter((use: { ingredient: number }) => use.ingredient !== 10)
				.map((use: { ingredient: number }) => ({
					...use,
					ingredient: use.ingredient > 10 ? use.ingredient - 1 : use.ingredient
				}));
		}
		const draft = draftOf(raw);
		assert.equal(draft.ingredientLines[10], '5 EL Tomatenmark');
		assert.deepEqual(draft.checks?.find((check) => check.kind === 'line-added')?.at, {
			ingredient: 10
		});
		// The exact name in step 4 is linked again, by the old matcher's sure rule.
		assert.ok(draft.steps[3].uses?.some((use) => use.ingredient === 10));
	});

	it('turns a word on no list into a question and keeps it in the note', () => {
		const card: SourceRecipe = {
			name: 'Wurstsalat',
			servings: 2,
			timeMinutes: null,
			ingredientLines: ['2 Ringe Fleischwurst'],
			steps: ['Die Fleischwurst in Streifen schneiden.']
		};
		const draft = draftOf(
			{
				name: 'Wurstsalat',
				ingredients: [
					{ source: 0, quantity: 2, unit: null, countingWord: 'Ringe', name: 'Fleischwurst' }
				],
				steps: [{ text: 'Die Fleischwurst in Streifen schneiden.', uses: [] }]
			},
			{ source: card, text: null }
		);
		assert.equal(draft.ingredientLines[0], '2 Fleischwurst');
		assert.equal(draft.ingredientDetails?.[0]?.note, 'Ringe');
		assert.deepEqual(
			draft.checks?.find((check) => check.kind === 'new-unit'),
			{
				kind: 'new-unit',
				level: 'check',
				word: 'Ringe',
				name: 'Fleischwurst',
				at: { ingredient: 0 }
			}
		);
		// …and the household's own word is a unit like any other.
		const known = draftOf(
			{
				name: 'Wurstsalat',
				ingredients: [
					{ source: 0, quantity: 2, unit: null, countingWord: 'Ringe', name: 'Fleischwurst' }
				],
				steps: [{ text: 'Die Fleischwurst in Streifen schneiden.', uses: [] }]
			},
			{ source: card, text: null, known: new Set(['ringe']) }
		);
		assert.equal(known.ingredientLines[0], '2 Ringe Fleischwurst');
	});

	it('flags steps that give an ingredient more than the recipe has', () => {
		const card: SourceRecipe = {
			name: 'Karottenkuchen',
			servings: 8,
			timeMinutes: null,
			ingredientLines: ['400 g Karotten'],
			steps: ['200 g Karotten reiben.', 'Die übrigen 300 g Karotten würfeln.']
		};
		const draft = draftOf(
			{
				name: 'Karottenkuchen',
				ingredients: [{ source: 0, quantity: 400, unit: 'g', name: 'Karotten' }],
				steps: card.steps.map((text, at) => ({
					text,
					uses: [{ ingredient: 0, phrase: 'Karotten', amountPhrase: at ? '300 g' : '200 g' }]
				}))
			},
			{ source: card, text: null }
		);
		assert.ok(kinds(draft.checks).includes('shares-exceed'));
	});

	it('asks about servings of 1 for a cake, and not for one portion', () => {
		const card: SourceRecipe = {
			name: 'Kuchen',
			servings: 1,
			servingsText: '1 Kuchen',
			timeMinutes: null,
			ingredientLines: ['200 g Mehl'],
			steps: ['Backen.']
		};
		const raw = {
			name: 'Kuchen',
			ingredients: [{ source: 0, quantity: 200, unit: 'g', name: 'Mehl' }],
			steps: [{ text: 'Backen.', uses: [] }]
		};
		assert.ok(kinds(draftOf(raw, { source: card, text: null }).checks).includes('servings'));
		const portion = { ...card, servingsText: '1 Portion' };
		assert.ok(!kinds(draftOf(raw, { source: portion, text: null }).checks).includes('servings'));
	});

	it('says a photo import could not be checked against a page', () => {
		const draft = draftOf(
			{ name: 'Strudel', ingredients: [{ quantity: 1, name: 'Ei' }], steps: ['Backen.'] },
			{ source: null, text: null, photos: true }
		);
		assert.ok(kinds(draft.checks).includes('from-photo'));
	});
});

/**
 * "The page's own words" means its words, not its punctuation (→ plan 44,
 * coordinator 2026-11-23): a real model adds or drops a full stop, writes
 * "200 g" for "200g", or mends "erhitzen.Hackfleisch". The gate compares
 * word tokens, so those are the page's words and a changed word is not.
 */
describe('the gate compares words, not punctuation', () => {
	const page = [
		'Das Olivenöl in einer Pfanne erhitzen.Hackfleisch dazugeben und „scharf“ anbraten.',
		'200g Mehl  einrühren und 10 Minuten köcheln lassen.',
		'Mit Salz würzen.',
		'Heiß servieren.'
	];
	const card: SourceRecipe = {
		name: 'Soße',
		servings: 4,
		timeMinutes: null,
		ingredientLines: ['200 g Mehl', '2 EL Olivenöl', '500 g Hackfleisch'],
		steps: page
	};
	const rows = [
		{ source: 0, quantity: 200, unit: 'g', name: 'Mehl' },
		{ source: 1, quantity: 2, unit: 'tbsp', name: 'Olivenöl' },
		{ source: 2, quantity: 500, unit: 'g', name: 'Hackfleisch' }
	];
	const answer = (first: string, second: string) => ({
		name: 'Soße',
		ingredients: rows,
		steps: [
			{ text: first, uses: [] },
			{ text: second, uses: [{ ingredient: 0, phrase: 'Mehl', amountPhrase: '200 g' }] },
			{ text: 'Mit Salz würzen.', uses: [] },
			{ text: 'Heiß servieren.', uses: [] }
		]
	});
	const reworded = (first: string, second: string) => {
		const result = validateRecipeDraft(answer(first, second), {
			source: card,
			text: null,
			instructed: false
		});
		return result.ok
			? (result.draft.checks ?? [])
					.filter((check) => check.kind === 'reworded')
					.map((check) => (check.at as { step: number }).step)
			: result.reason;
	};
	const faithful =
		'Das Olivenöl in einer Pfanne erhitzen. Hackfleisch dazugeben und "scharf" anbraten';

	it('takes a dropped full stop, a mended space, plain quotes, "200 g" for "200g", one space for two', () => {
		assert.deepEqual(reworded(faithful, '200 g Mehl einrühren und 10 Minuten köcheln lassen'), []);
	});

	it('still flags one changed word, two swapped words, or one added word', () => {
		const second = '200 g Mehl einrühren und 10 Minuten köcheln lassen.';
		assert.deepEqual(reworded(faithful.replace('Pfanne', 'Kasserolle'), second), [0]);
		assert.deepEqual(
			reworded(faithful.replace('scharf" anbraten', 'anbraten "scharf'), second),
			[0]
		);
		assert.deepEqual(reworded(faithful.replace('Pfanne', 'großen Pfanne'), second), [0]);
	});

	it('finds an amount phrase written apart in a step that writes it together, as the step writes it', () => {
		const result = validateRecipeDraft(answer(faithful, page[1]), {
			source: card,
			text: null,
			instructed: false
		});
		assert.ok(result.ok);
		assert.deepEqual(result.draft.steps[1].uses?.[0], {
			ingredient: 0,
			quantity: null,
			phrase: 'Mehl',
			amountPhrase: '200g'
		});
	});

	it('keeps nothing left out for a step that only lost its punctuation', () => {
		const result = validateRecipeDraft(
			answer(faithful, '200 g Mehl einrühren und 10 Minuten köcheln lassen'),
			{ source: card, text: null, instructed: false }
		);
		assert.ok(result.ok);
		assert.deepEqual(result.draft.leftOut, []);
	});
});

describe('the token view, after the second code review', () => {
	const gate = (card: SourceRecipe, raw: unknown) => {
		const result = validateRecipeDraft(raw, { source: card, text: null, instructed: false });
		assert.ok(result.ok, JSON.stringify(result));
		return result.draft;
	};

	it('keeps what makes a number that number: "1-2 TL" for "1/2 TL" is reworded', () => {
		const card: SourceRecipe = {
			name: 'x',
			servings: 2,
			timeMinutes: null,
			ingredientLines: ['1 TL Salz'],
			steps: ['1/2 TL Salz einrühren.', 'Ruhen lassen.', 'Servieren.', 'Genießen.']
		};
		const draft = gate(card, {
			name: 'x',
			ingredients: [{ source: 0, quantity: 1, unit: 'tsp', name: 'Salz' }],
			steps: ['1-2 TL Salz einrühren.', 'Ruhen lassen.', 'Servieren.', 'Genießen.'].map((text) => ({
				text,
				uses: []
			}))
		});
		assert.deepEqual(draft.checks?.find((check) => check.kind === 'reworded')?.at, { step: 0 });
	});

	it('takes the amount that stands beside the phrase, where the same amount stands twice', () => {
		const text = '200g Zucker und 200 g Mehl verrühren.';
		const card: SourceRecipe = {
			name: 'x',
			servings: 2,
			timeMinutes: null,
			ingredientLines: ['200 g Zucker', '400 g Mehl'],
			steps: [text]
		};
		const draft = gate(card, {
			name: 'x',
			ingredients: [
				{ source: 0, quantity: 200, unit: 'g', name: 'Zucker' },
				{ source: 1, quantity: 400, unit: 'g', name: 'Mehl' }
			],
			steps: [{ text, uses: [{ ingredient: 1, phrase: 'Mehl', amountPhrase: '200 g' }] }]
		});
		assert.equal(draft.steps[0].uses?.find((use) => use.ingredient === 1)?.amountPhrase, '200 g');
	});

	it('gives a long step’s pieces each link once, and each its card step’s part', () => {
		const long = `${'Die Butter rühren und warten. '.repeat(21)}Den Teig ruhen lassen.`;
		const card: SourceRecipe = {
			name: 'x',
			servings: 2,
			timeMinutes: null,
			ingredientLines: ['100 g Butter'],
			steps: [long, 'Backen.', 'Servieren.'],
			stepSections: ['Teig', 'Ofen', 'Tisch']
		};
		const draft = gate(card, {
			name: 'x',
			ingredients: [{ source: 0, quantity: 100, unit: 'g', name: 'Butter' }],
			// The long step comes back whole (the gate splits it); the last step is dropped.
			steps: [
				{ text: long, uses: [{ ingredient: 0, phrase: 'Butter', quantity: 50 }] },
				{ text: 'Backen.', uses: [] }
			]
		});
		assert.equal(draft.steps.length, 3);
		assert.deepEqual(
			draft.steps.map((step) => step.section),
			['Teig', 'Teig', 'Ofen']
		);
		const shares = draft.steps.flatMap((step) =>
			(step.uses ?? []).filter((use) => use.quantity !== null)
		);
		assert.equal(shares.length, 1);
		assert.ok(!(draft.checks ?? []).some((check) => check.kind === 'shares-exceed'));
	});
});

describe('the gate, after code review', () => {
	it('knows a household word in its plural ("Ring" added, the page says "Ringe")', () => {
		const card: SourceRecipe = {
			name: 'Wurstsalat',
			servings: 2,
			timeMinutes: null,
			ingredientLines: ['2 Ringe Fleischwurst'],
			steps: ['Die Fleischwurst in Streifen schneiden.']
		};
		const draft = draftOf(
			{
				name: 'Wurstsalat',
				ingredients: [
					{ source: 0, quantity: 2, unit: null, countingWord: 'Ringe', name: 'Fleischwurst' }
				],
				steps: [{ text: 'Die Fleischwurst in Streifen schneiden.', uses: [] }]
			},
			{ source: card, text: null, known: new Set(['ring']) }
		);
		assert.equal(draft.ingredientLines[0], '2 Ringe Fleischwurst');
		assert.deepEqual(
			kinds(draft.checks).filter((kind) => kind === 'new-unit' || kind === 'amount-differs'),
			[]
		);
	});

	it('refuses an answer that dropped most of the method', () => {
		const raw = copy();
		raw.steps = raw.steps.slice(0, 2);
		assert.deepEqual(validateRecipeDraft(raw, context), { ok: false, reason: 'fidelity' });
		assert.deepEqual(validateRecipeDraft({ ...copy(), steps: [] }, context), {
			ok: false,
			reason: 'fidelity'
		});
	});

	it('takes "Eier" for "3 Ei(er)": the line says both', () => {
		const card: SourceRecipe = {
			name: 'Schmarrn',
			servings: 2,
			timeMinutes: null,
			ingredientLines: ['3 Ei(er)'],
			steps: ['Die Eier trennen.']
		};
		const draft = draftOf(
			{
				name: 'Schmarrn',
				ingredients: [{ source: 0, quantity: 3, unit: null, name: 'Eier' }],
				steps: [{ text: 'Die Eier trennen.', uses: [] }]
			},
			{ source: card, text: null }
		);
		assert.ok(!kinds(draft.checks).includes('name-differs'));
	});

	it('takes "oder"/"or" from just before the alternative, not from anywhere in a paste', () => {
		const text = 'Tipp: Brot or Semmeln dazu.\n500 g Hack oder veganes Hack\nDas Hack anbraten.';
		const draft = draftOf(
			{
				name: 'Ragù',
				ingredients: [{ quantity: 500, unit: 'g', name: 'Hack', alternative: 'veganes Hack' }],
				steps: [{ text: 'Das Hack anbraten.', uses: [] }]
			},
			{ source: null, text }
		);
		assert.equal(draft.ingredientDetails?.[0]?.note, 'oder veganes Hack');
	});
});

/**
 * Every corpus page with the fake provider's recorded answer
 * (`npm run import:eval -- --fake --record`): the fake echoes a card line by
 * line, so the gate must give a draft that covers every page line, invents
 * nothing, and links only rows that exist. Pages with no card get the fake's
 * pancakes, which are not on the page: refused for fidelity.
 */
describe('the gate on every corpus page (the fake provider’s recorded answers)', () => {
	const fixtures = readdirSync('tests/fixtures/ai-answers')
		.filter((file) => file.startsWith('fake-'))
		.map((file) => file.replace(/^fake-|\.json$/g, ''));

	for (const fixture of fixtures) {
		it(fixture, () => {
			const html = readFileSync(`src/lib/utils/fixtures/${fixture}.html`, 'utf8');
			const read = readFetchedPage({ html, finalUrl: 'https://example.com/' });
			const raw = JSON.parse(
				readFileSync(`tests/fixtures/ai-answers/fake-${fixture}.json`, 'utf8')
			);
			const result = validateRecipeDraft(raw, {
				source: read.card,
				text: read.text,
				instructed: false
			});
			if (!read.card) {
				assert.deepEqual(result, { ok: false, reason: 'fidelity' });
				return;
			}
			assert.ok(result.ok);
			const { draft } = result;
			assert.equal(draft.ingredientLines.length, read.card.ingredientLines.length);
			assert.ok(!kinds(draft.checks).includes('line-added'));
			for (const step of draft.steps) {
				for (const use of step.uses ?? []) assert.ok(use.ingredient < draft.ingredientLines.length);
			}
			for (const one of draft.ingredientDetails ?? []) {
				assert.ok((one?.section ?? '').length <= 40);
			}
		});
	}
});
