/**
 * A step drawn from its stored links (→ plan 43). What is underlined is what
 * was stored, and the only amount that moves is the stored amount run.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { scaleIngredients } from './ingredients';
import type { StepUse } from './step-highlight';
import {
	amountFits,
	hasStoredLinks,
	linkWord,
	locateAmounts,
	renderStep,
	scaleAmountPhrase,
	stepShare,
	suggestLinks,
	tokens,
	type LinkTarget
} from './step-links';

type Row = { id: string; name: string; quantity: number | null; unit: string | null };

const rows: Row[] = [
	{ id: 'zwiebel', name: 'Zwiebel', quantity: 1, unit: null },
	{ id: 'oel', name: 'Olivenöl', quantity: 2, unit: 'tbsp' },
	{ id: 'hack', name: 'Faschiertes', quantity: 500, unit: 'g' },
	{ id: 'zimt', name: 'Zimt', quantity: 0.5, unit: 'tsp' },
	{ id: 'milch', name: 'Milch', quantity: 0.5, unit: 'L' },
	{ id: 'tomaten', name: 'Tomaten', quantity: 5, unit: null },
	{ id: 'eier', name: 'Eier', quantity: 2, unit: null },
	{ id: 'butter', name: 'Butter', quantity: 100, unit: 'g' },
	{ id: 'zucker', name: 'Zucker', quantity: 100, unit: 'g' },
	{ id: 'karotten', name: 'Karotten', quantity: 400, unit: 'g' },
	{ id: 'mehl', name: 'Mehl', quantity: 200, unit: 'g' }
];

const link = (
	ingredientId: string,
	phrase: string | null,
	amountPhrase: string | null = null,
	quantity: number | null = null
): StepUse => ({ ingredientId, quantity, phrase, amountPhrase });

/** The step as cook mode would draw it, cooking for `factor` × the recipe. */
function draw(text: string, uses: StepUse[] | null, factor = 1) {
	return renderStep({ text, uses }, scaleIngredients(rows, factor), factor);
}

/** The runs, with an underline as [word→id] and a scaled amount as {now|was}. */
function show(text: string, uses: StepUse[] | null, factor = 1): string {
	return draw(text, uses, factor)
		.segments.map((segment) =>
			segment.ingredient
				? `[${segment.text}→${segment.ingredient.id}]`
				: segment.scaledFrom
					? `{${segment.text}|${segment.scaledFrom}}`
					: segment.text
		)
		.join('');
}

describe('renderStep from stored links', () => {
	it('underlines a phrase that is not the ingredient’s name', () => {
		assert.equal(
			show('Zwiebelwürfel zum Hackfleisch geben.', [
				link('zwiebel', 'Zwiebelwürfel'),
				link('hack', 'Hackfleisch')
			]),
			'[Zwiebelwürfel→zwiebel] zum [Hackfleisch→hack] geben.'
		);
	});

	it('underlines every occurrence of a phrase in the step', () => {
		assert.equal(
			show('Die Zwiebel schälen, dann die Zwiebel würfeln.', [link('zwiebel', 'Zwiebel')]),
			'Die [Zwiebel→zwiebel] schälen, dann die [Zwiebel→zwiebel] würfeln.'
		);
	});

	it('never underlines a phrase inside a longer word', () => {
		assert.equal(
			show('Die Zwiebelwürfel anschwitzen.', [link('zwiebel', 'Zwiebel')]),
			'Die Zwiebelwürfel anschwitzen.'
		);
	});

	it('renders a phrase the text no longer contains as plain text', () => {
		const drawn = draw('Alles gut verrühren.', [link('zwiebel', 'Zwiebelwürfel')]);
		assert.equal(drawn.segments.length, 1);
		assert.equal(drawn.segments[0].text, 'Alles gut verrühren.');
		// Still used by the step: it is listed, only nothing is underlined.
		assert.deepEqual(
			drawn.used.map((row) => row.id),
			['zwiebel']
		);
	});

	it('lists an ingredient linked without words, and underlines nothing for it', () => {
		const drawn = draw('Die restlichen Zutaten unterheben.', [
			link('zwiebel', 'Zwiebel'),
			link('hack', null)
		]);
		assert.deepEqual(
			drawn.used.map((row) => row.id),
			['zwiebel', 'hack']
		);
		assert.equal(drawn.linked, true);
	});

	it('drops a link to an ingredient that is gone', () => {
		const drawn = draw('Zwiebel und Speck anbraten.', [
			link('zwiebel', 'Zwiebel'),
			link('deleted', 'Speck')
		]);
		assert.deepEqual(
			drawn.used.map((row) => row.id),
			['zwiebel']
		);
		assert.equal(
			show('Zwiebel und Speck anbraten.', [link('zwiebel', 'Zwiebel'), link('deleted', 'Speck')]),
			'[Zwiebel→zwiebel] und Speck anbraten.'
		);
	});

	it('names one ingredient by two phrases in one step', () => {
		assert.equal(
			show('Die Karotte schälen und die Schale zu den Möhren reiben.', [
				link('zwiebel', 'Karotte'),
				link('zwiebel', 'Möhren')
			]),
			'Die [Karotte→zwiebel] schälen und die Schale zu den [Möhren→zwiebel] reiben.'
		);
	});
});

describe('the stored amount run, cooking for a different number', () => {
	const text = '1 - 2 EL Olivenöl erhitzen, bei 180 °C 5 - 7 Min. braten.';
	const uses = [link('oel', 'Olivenöl', '1 - 2 EL')];

	it('scales both numbers of a range and nothing else', () => {
		assert.equal(
			show(text, uses, 2),
			'{2 - 4 EL|1 - 2 EL} [Olivenöl→oel] erhitzen, bei 180 °C 5 - 7 Min. braten.'
		);
	});

	it('leaves the text as written when cooking for the number it was written for', () => {
		assert.equal(
			show(text, uses, 1),
			'1 - 2 EL [Olivenöl→oel] erhitzen, bei 180 °C 5 - 7 Min. braten.'
		);
	});

	it('keeps a fraction a fraction and a decimal comma a comma', () => {
		assert.equal(scaleAmountPhrase('½', 2), '1');
		assert.equal(scaleAmountPhrase('¼ TL', 2), '½ TL');
		assert.equal(scaleAmountPhrase('0,25 l', 2), '0,5 l');
		assert.equal(scaleAmountPhrase('1 1/2 EL', 2), '3 EL');
		assert.equal(scaleAmountPhrase('200 g', 1.5), '300 g');
		// A leading zero is a decimal, never a thousands group.
		assert.equal(scaleAmountPhrase('0,250 kg', 2), '0,5 kg');
		assert.equal(scaleAmountPhrase('1.200 g', 2), '1.200 g');
	});

	it('rewrites the run where it stands before the phrase, not an earlier one', () => {
		assert.equal(
			show('2 EL Wasser und 2 EL Olivenöl verrühren.', [link('oel', 'Olivenöl', '2 EL')], 2),
			'2 EL Wasser und {4 EL|2 EL} [Olivenöl→oel] verrühren.'
		);
	});

	it('finds an amount run that does not stand before its phrase', () => {
		assert.equal(
			show('Die Milch dazu, insgesamt ½ l.', [link('milch', 'Milch', '½ l')], 2),
			'Die [Milch→milch] dazu, insgesamt {1 l|½ l}.'
		);
	});

	it('does not find an amount inside a longer number', () => {
		assert.equal(
			show('12 EL Olivenöl.', [link('oel', 'Olivenöl', '2 EL')], 2),
			'12 EL [Olivenöl→oel].'
		);
	});

	it('carries the step’s share, scaled, on the underlined row', () => {
		const drawn = draw('1 EL Olivenöl erhitzen.', [link('oel', 'Olivenöl', '1 EL', 1)], 2);
		const underlined = drawn.segments.find((segment) => segment.ingredient);
		assert.equal(underlined?.ingredient?.quantity, 2);
	});
});

describe('an amount is rewritten only beside its words', () => {
	it('never doubles a time that comes first: "Nach 5 Min. die 5 reifen Tomaten"', () => {
		assert.equal(
			show('Nach 5 Min. die 5 reifen Tomaten zugeben.', [link('tomaten', 'Tomaten', '5')], 2),
			'Nach 5 Min. die {10|5} reifen [Tomaten→tomaten] zugeben.'
		);
	});

	it('never doubles an oven setting: "Stufe 2 … 2 große Eier"', () => {
		assert.equal(
			show('Backofen auf Stufe 2 vorheizen. 2 große Eier trennen.', [link('eier', 'Eier', '2')], 2),
			'Backofen auf Stufe 2 vorheizen. {4|2} große [Eier→eier] trennen.'
		);
	});

	it('gives two links with the same amount each their own', () => {
		assert.equal(
			show(
				'100 g weiche Butter und 100 g feinen Zucker verrühren.',
				[link('butter', 'Butter', '100 g'), link('zucker', 'Zucker', '100 g')],
				2
			),
			'{200 g|100 g} weiche [Butter→butter] und {200 g|100 g} feinen [Zucker→zucker] verrühren.'
		);
	});

	it('rewrites every occurrence that has its amount beside it', () => {
		assert.equal(
			show(
				'2 EL Olivenöl erhitzen, später weitere 2 EL Olivenöl.',
				[link('oel', 'Olivenöl', '2 EL')],
				2
			),
			'{4 EL|2 EL} [Olivenöl→oel] erhitzen, später weitere {4 EL|2 EL} [Olivenöl→oel].'
		);
	});

	it('allows a comma between two describing words', () => {
		assert.deepEqual(locateAmounts('2 große, reife Tomaten', 'Tomaten', '2'), [[0, 1]]);
	});

	it('looks after the word when nothing stands before it', () => {
		assert.equal(
			show('Die Karotten (400 g) schälen.', [link('karotten', 'Karotten', '400 g')], 2),
			'Die [Karotten→karotten] ({800 g|400 g}) schälen.'
		);
		assert.equal(
			show('Karotten, etwa 400 g, schälen.', [link('karotten', 'Karotten', '400 g')], 2),
			'[Karotten→karotten], etwa {800 g|400 g}, schälen.'
		);
	});

	it('rewrites nothing when the amount stands beside no occurrence', () => {
		assert.equal(
			show('5 Minuten warten. Dann die Tomaten zugeben.', [link('tomaten', 'Tomaten', '5')], 2),
			'5 Minuten warten. Dann die [Tomaten→tomaten] zugeben.'
		);
		assert.deepEqual(locateAmounts('Nach 5 Min. die Tomaten zugeben.', 'Tomaten', '5'), []);
		// More than three words between is too far.
		assert.deepEqual(locateAmounts('2 sehr sehr große reife Eier', 'Eier', '2'), []);
	});
});

describe('a link stored without words', () => {
	it('is underlined where the text says its name', () => {
		assert.equal(
			show('Zwiebelwürfel in Olivenöl anschwitzen.', [
				link('zwiebel', 'Zwiebelwürfel'),
				link('oel', null)
			]),
			'[Zwiebelwürfel→zwiebel] in [Olivenöl→oel] anschwitzen.'
		);
	});

	it('keeps plan 23’s rule for the number before it, beside a worded link', () => {
		assert.equal(
			show(
				'1 - 2 EL Olivenöl erhitzen, 200 g Mehl einrühren.',
				[link('oel', 'Olivenöl', '1 - 2 EL'), link('mehl', null)],
				2
			),
			'{2 - 4 EL|1 - 2 EL} [Olivenöl→oel] erhitzen, {400 g|200 g} [Mehl→mehl] einrühren.'
		);
	});

	it('scales its stored amount beside the name the matcher found', () => {
		assert.equal(
			show(
				'Olivenöl erhitzen, 200 g Mehl einrühren.',
				[link('oel', 'Olivenöl'), link('mehl', null, '200 g')],
				2
			),
			'[Olivenöl→oel] erhitzen, {400 g|200 g} [Mehl→mehl] einrühren.'
		);
	});

	it('never underlines inside a run a stored link already claimed', () => {
		assert.equal(
			show('Zwiebel schälen.', [link('zwiebel', 'Zwiebel schälen'), link('zwiebel', null)]),
			'[Zwiebel schälen→zwiebel].'
		);
	});
});

describe('one ingredient linked twice', () => {
	it('uses the shares of both links, added up', () => {
		const uses = [link('butter', 'Butter', null, 30), link('butter', 'restliche Butter', null, 20)];
		assert.equal(stepShare(uses, 'butter'), 50);
		const drawn = draw('Butter schmelzen, dann die restliche Butter.', uses);
		assert.equal(drawn.used[0].quantity, 50);
		assert.equal(stepShare([link('butter', 'Butter')], 'butter'), null);
	});
});

describe('the fallback for steps without stored words', () => {
	it('reads a step nobody has linked with the matcher, as before', () => {
		const drawn = draw('Die Zwiebel würfeln.', null);
		assert.equal(drawn.linked, false);
		assert.equal(show('Die Zwiebel würfeln.', null), 'Die [Zwiebel→zwiebel] würfeln.');
	});

	it('reads a step pinned by hand before plan 43 as before', () => {
		const pinned: StepUse[] = [{ ingredientId: 'zwiebel', quantity: null }];
		assert.equal(hasStoredLinks(pinned), false);
		assert.equal(show('Die Zwiebel würfeln.', pinned), 'Die [Zwiebel→zwiebel] würfeln.');
	});

	it('scales the number before an underlined word on the fallback, as plan 23 did', () => {
		assert.equal(
			show('2 EL Olivenöl erhitzen.', null, 1.5),
			'{3 EL|2 EL} [Olivenöl→oel] erhitzen.'
		);
	});
});

/* ── The editor's side (→ plan 46) ─────────────────────────────────────────── */

const targets: LinkTarget[] = rows.map((row) => ({ ...row, key: row.id }));
const target = (id: string) => targets.find((row) => row.key === id)!;

describe('tokens', () => {
	const kinds = (text: string) => tokens(text).map((token) => `${token.kind}:${token.text}`);

	it('cuts a step into words, amounts with their unit, and times that are no amount', () => {
		assert.deepEqual(kinds('Zwiebelwürfel und 200 g Karotten 2 - 3 Min. mitbraten.'), [
			'word:Zwiebelwürfel',
			'word:und',
			'amount:200 g',
			'word:Karotten',
			'fixed:2 - 3 Min.',
			'word:mitbraten'
		]);
	});

	it('keeps a range with its unit, and a temperature and a length out of the amounts', () => {
		assert.deepEqual(kinds('1 - 2 EL Olivenöl bei 180 °C, 2 cm Würfel'), [
			'amount:1 - 2 EL',
			'word:Olivenöl',
			'word:bei',
			'fixed:180 °C',
			'fixed:2 cm',
			'word:Würfel'
		]);
	});

	it('reads a counting word and a household’s own word as the amount’s unit', () => {
		assert.deepEqual(kinds('2 Zehen Knoblauch'), ['amount:2 Zehen', 'word:Knoblauch']);
		assert.deepEqual(kinds('2 Kugel Eis'), ['amount:2', 'word:Kugel', 'word:Eis']);
		assert.deepEqual(
			tokens('2 Kugel Eis', new Set(['kugel'])).map((token) => token.text),
			['2 Kugel', 'Eis']
		);
	});

	it('gives every token its place in the text', () => {
		const text = 'Mit ½ TL Zimt bestreuen.';
		for (const token of tokens(text)) assert.equal(text.slice(token.start, token.end), token.text);
	});
});

describe('linkWord', () => {
	const linkAt = (text: string, word: string, id: string) => {
		const start = text.indexOf(word);
		return linkWord(text, tokens(text), start, start + word.length, target(id));
	};

	it('links the amount in front of the word with it, as the step’s share', () => {
		assert.deepEqual(linkAt('200 g Karotten schälen.', 'Karotten', 'karotten'), {
			ingredient: 'karotten',
			phrase: 'Karotten',
			amountPhrase: '200 g',
			quantity: 200
		});
	});

	it('takes the whole row as no share, and a range as no share either', () => {
		assert.equal(linkAt('400 g Karotten schälen.', 'Karotten', 'karotten').quantity, null);
		assert.equal(linkAt('400 g Karotten schälen.', 'Karotten', 'karotten').amountPhrase, '400 g');
		const oil = linkAt('1 - 2 EL Olivenöl erhitzen.', 'Olivenöl', 'oel');
		assert.equal(oil.amountPhrase, '1 - 2 EL');
		assert.equal(oil.quantity, null);
	});

	it('leaves an amount above the row’s total, or in another unit, unlinked', () => {
		assert.equal(linkAt('600 g Karotten schälen.', 'Karotten', 'karotten').amountPhrase, null);
		assert.equal(linkAt('2 EL Karotten schälen.', 'Karotten', 'karotten').amountPhrase, null);
	});

	it('finds the amount after the word in brackets, and none in another sentence', () => {
		assert.equal(linkAt('Karotten (200 g) schälen.', 'Karotten', 'karotten').amountPhrase, '200 g');
		assert.equal(
			linkAt('Nimm 200 g. Karotten schälen.', 'Karotten', 'karotten').amountPhrase,
			null
		);
	});

	it('links a word that is not the ingredient’s name, with its amount', () => {
		assert.deepEqual(linkAt('1 Zwiebelwürfel anbraten.', 'Zwiebelwürfel', 'zwiebel'), {
			ingredient: 'zwiebel',
			phrase: 'Zwiebelwürfel',
			amountPhrase: '1',
			quantity: null
		});
	});

	it('stores an amount cook mode then rewrites for twice as many', () => {
		const text = '200 g Karotten schälen.';
		const made = linkAt(text, 'Karotten', 'karotten');
		const use = link('karotten', made.phrase, made.amountPhrase, made.quantity);
		assert.equal(show(text, [use], 2), '{400 g|200 g} [Karotten→karotten] schälen.');
	});
});

describe('amountFits', () => {
	it('compares a unit by what it measures', () => {
		assert.deepEqual(amountFits('1 Esslöffel', target('oel')), { fits: true, share: 1 });
		assert.deepEqual(amountFits('2', target('eier')), { fits: true, share: null });
		assert.equal(amountFits('2 Stk.', target('eier')).fits, true);
	});
});

describe('suggestLinks', () => {
	it('suggests an exact name, and nothing for a compound', () => {
		assert.deepEqual(
			suggestLinks('Die Zwiebel und die Zwiebelwürfel.', targets, []).map((one) => one.phrase),
			['Zwiebel']
		);
		assert.deepEqual(suggestLinks('Die Zwiebelwürfel anbraten.', targets, []), []);
	});

	it('never suggests a row the step already links', () => {
		const linked = [{ ingredient: 'zwiebel', phrase: 'Zwiebelwürfel' }];
		assert.deepEqual(suggestLinks('Zwiebelwürfel und Zwiebel.', targets, linked), []);
	});

	it('never suggests a word inside a linked phrase, nor a dismissed one', () => {
		const linked = [{ ingredient: 'hack', phrase: 'Butter und Mehl' }];
		assert.deepEqual(suggestLinks('Butter und Mehl verrühren.', targets, linked), []);
		assert.deepEqual(suggestLinks('Butter schmelzen.', targets, [], ['butter']), []);
	});

	it('says where the suggested word stands', () => {
		const [one] = suggestLinks('Das Mehl sieben.', targets, []);
		assert.deepEqual(one, { ingredient: 'mehl', phrase: 'Mehl', start: 4, end: 8 });
	});
});

describe('a household’s own word in a step (plan 46 review)', () => {
	it('reads its plural as the amount’s unit, and as the row’s', () => {
		const known = new Set(['ring']);
		assert.deepEqual(
			tokens('2 Ringe Fleischwurst würfeln.', known).map((token) => token.text),
			['2 Ringe', 'Fleischwurst', 'würfeln']
		);
		assert.deepEqual(amountFits('2 Ringe', { quantity: 2, unit: 'Ring' }), {
			fits: true,
			share: null
		});
	});
});
