/**
 * The import corpus (→ plan 44): 18 real recipe pages saved on 2026-11-23 with
 * `npm run import:probe -- <url> --save <name> --trim`, plus the four the repo
 * had, read the way an import reads them (`readFetchedPage`). Each row pins what
 * a person sees on the page: how many ingredient lines and steps, the parts,
 * the name and the time. A reader change that moves one of these numbers has to
 * say why here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { readFetchedPage } from '../server/recipe-import';

type Expected = {
	reader: 'json-ld' | 'microdata' | null;
	name?: string;
	time?: number | null;
	lines?: number;
	steps?: number;
	/** The parts in order, as they start; [] for none. */
	ingredientParts?: string[];
	stepParts?: string[];
};

const CORPUS: Record<string, Expected> = {
	'chefkoch-lasagne': {
		reader: 'json-ld',
		name: 'Lasagne alla Bolognese mit Béchamelsoße von Callista',
		time: 100,
		lines: 22,
		steps: 4,
		ingredientParts: ['Sauce (Bolognesesoße)', 'Sauce (Béchamelsoße)'],
		stepParts: []
	},
	'chefkoch-schnitzel': {
		reader: 'json-ld',
		time: 40,
		lines: 19,
		steps: 1,
		ingredientParts: [],
		stepParts: []
	},
	'emmikochteinfach-lasagne': {
		reader: 'json-ld',
		time: 75,
		lines: 22,
		steps: 15,
		// The remark group ("Du benötigst eine Auflaufform …") holds no rows.
		ingredientParts: ['Lasagne', 'Bolognesesauce', 'Béchamelsauce'],
		stepParts: ['Bolognesesauce', 'Béchamelsauce', 'Lasagne schichten & backen']
	},
	'recipetineats-lasagna': {
		reader: 'json-ld',
		name: 'Lasagna',
		time: 260,
		lines: 24,
		steps: 18,
		ingredientParts: ['Ragu Bolognese', 'Cheese Sauce (Besciamella)', 'Lasagna'],
		stepParts: ['Ragu', 'Cheese Sauce', 'Assemble']
	},
	'zuckerjagdwurst-lasagne': {
		reader: 'json-ld',
		time: 85,
		// Each part is one string on this site; the model splits them (→ plan 44).
		lines: 3,
		steps: 6,
		ingredientParts: ['„Hack“-Schicht', 'Béchamelsoße', 'Außerdem']
	},
	'jamieoliver-katsu-curry': {
		reader: 'json-ld',
		name: 'Chicken katsu curry',
		time: 90,
		lines: 20,
		steps: 11,
		ingredientParts: ['Katsu curry sauce', 'Pickle'],
		stepParts: []
	},
	'servus-gansl': {
		reader: 'json-ld',
		time: 240,
		lines: 36,
		steps: 13,
		ingredientParts: ['Gansl', 'Rotkraut', 'Kartoffelknödel', 'Glasierten Maroni']
	},
	'billa-schnitzel': { reader: 'json-ld', time: 50, lines: 20, steps: 4, ingredientParts: [] },
	'gutekueche-lasagne': {
		reader: 'json-ld',
		name: 'Lasagne Bolognese',
		time: 55,
		lines: 22,
		steps: 7,
		ingredientParts: ['Bechamelsauce', 'Bolognesesauce']
	},
	'ichkoche-topfenstrudel': {
		reader: 'microdata',
		name: 'Topfenstrudel',
		time: 75,
		lines: 20,
		steps: 12
	},
	'cookingcatrin-erdaepfelsalat': { reader: null },
	'kochbar-karottenkuchen': {
		reader: 'json-ld',
		time: null,
		lines: 17,
		steps: 4,
		ingredientParts: ['Karottenkuchen', 'Frischkäse-Frosting'],
		stepParts: ['Karottenkuchen', 'Frischkäse-Frosting und Finish']
	},
	'backenmachtgluecklich-carrot-cake': {
		reader: 'json-ld',
		name: 'Carrot Cake Cheesecake',
		time: 75,
		lines: 18,
		steps: 7,
		ingredientParts: ['Streusel', 'Carrot Cake Boden', 'Cheesecake-Creme']
	},
	'hellofresh-haehnchen': { reader: 'json-ld', time: 30, lines: 14, steps: 6 },
	'bonappetit-lasagna': {
		reader: 'json-ld',
		name: "BA's Best Lasagna",
		time: 345,
		lines: 23,
		steps: 9,
		stepParts: ['Ragù Bolognese', 'Béchamel and Assembly']
	},
	'eat-this-good-life-bowl': { reader: null },
	'ziiikocht-krautfleckerl': { reader: null },
	'sallysbakingaddiction-carrot-cake': {
		reader: 'json-ld',
		time: 210,
		lines: 21,
		steps: 8,
		ingredientParts: ['Cream Cheese Frosting']
	},
	'zuckerjagdwurst-curry': {
		reader: 'json-ld',
		lines: 36,
		steps: 13,
		ingredientParts: ['Orangensalat', 'Curry', 'Außerdem', 'Zum Servieren'],
		stepParts: ['Orangensalat', 'Kürbis-Curry']
	},
	'einfachkochen-quiche': { reader: 'json-ld', lines: 20, steps: 6, ingredientParts: [] },
	'einfachkochen-kaiserschmarrn': { reader: 'json-ld', lines: 11, steps: 3 },
	'smittenkitchen-pierogi': { reader: 'microdata', lines: 11, steps: 3 }
};

/** Each part's name once, where it starts. */
function parts(sections: (string | null)[]): string[] {
	return sections.filter(
		(one, at): one is string => one !== null && (at === 0 || sections[at - 1] !== one)
	);
}

describe('the import corpus, read as an import reads it', () => {
	for (const [fixture, expected] of Object.entries(CORPUS)) {
		it(fixture, () => {
			const html = readFileSync(`src/lib/utils/fixtures/${fixture}.html`, 'utf8');
			const page = readFetchedPage({ html, finalUrl: 'https://example.com/' });
			assert.equal(page.reader, expected.reader);

			if (!expected.reader) {
				// No card: the page's text is what a model reads.
				assert.ok(page.text.length > 1000, `${fixture} has text to read`);
				return;
			}

			const card = page.card!;
			if (expected.name !== undefined) assert.equal(card.name, expected.name);
			if (expected.time !== undefined) assert.equal(card.timeMinutes, expected.time);
			if (expected.lines !== undefined) assert.equal(card.ingredientLines.length, expected.lines);
			if (expected.steps !== undefined) assert.equal(card.steps.length, expected.steps);
			assert.equal(card.ingredientSections.length, card.ingredientLines.length);
			assert.equal(card.stepSections.length, card.steps.length);
			if (expected.ingredientParts)
				assert.deepEqual(parts(card.ingredientSections), expected.ingredientParts);
			if (expected.stepParts) assert.deepEqual(parts(card.stepSections), expected.stepParts);

			// No part name runs past what `section` holds (→ plan 43).
			for (const name of [...card.ingredientSections, ...card.stepSections]) {
				if (name) assert.ok(name.length <= 40, name);
			}
			// No template code and no portion variants survive into a step.
			for (const step of card.steps) assert.doesNotMatch(step, /\{\{|\[[^\]]*\|/);
			// No footnote and no price survive into a line.
			for (const line of card.ingredientLines) assert.doesNotMatch(line, /\(Note \d\)|\(\$/);
		});
	}
});
