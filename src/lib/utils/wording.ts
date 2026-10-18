/**
 * Austrian wording for imported German recipes (→ plan 24, SPEC §6, §9,
 * DECISIONS #150): Sahne → Obers, Quark → Topfen, Kartoffeln → Erdäpfel.
 *
 * A household setting, "Recipe wording", with one target for now — the list
 * is **fixed in code**, reviewed by hand, not edited in the app (an editable
 * list was put off on purpose). It applies **on import only**, to recipes that
 * read as German; a saved recipe is never rewritten behind anyone's back.
 *
 * - With AI, the model gets the list as a glossary and writes the recipe in
 *   Austrian German itself — it gets the articles right ("das Obers").
 * - Without AI, a word-for-word swap would break those articles inside a
 *   sentence, so `applyWording` touches **ingredient names only**.
 * - And so a step that still says "Sahne" keeps finding its "Obers", every pair
 *   is also a synonym for the step matcher (`wordingSynonyms`, → step-highlight).
 *
 * Pure, no `$lib` — `schema.ts` reads `RECIPE_WORDINGS` outside Vite.
 */

/** The wordings a household can choose; null in the column means "as written". */
export const RECIPE_WORDINGS = ['austrian'] as const;

export type RecipeWording = (typeof RECIPE_WORDINGS)[number];

export function isRecipeWording(value: unknown): value is RecipeWording {
	return typeof value === 'string' && (RECIPE_WORDINGS as readonly string[]).includes(value);
}

/**
 * German (Germany) → Austrian German, the words an Austrian kitchen actually
 * uses. Phrases before the words inside them ("saure Sahne" before "Sahne"),
 * singular and plural spelled out where they differ — the swap is whole words,
 * and German plurals aren't a suffix rule.
 */
export const AUSTRIAN_TERMS: readonly (readonly [from: string, to: string])[] = [
	['saure Sahne', 'Sauerrahm'],
	['Schlagsahne', 'Schlagobers'],
	['Sahne', 'Obers'],
	['Schmand', 'Sauerrahm'],
	['Quark', 'Topfen'],
	['Rinderhackfleisch', 'Rinderfaschiertes'],
	['Hackfleisch', 'Faschiertes'],
	['Gehacktes', 'Faschiertes'],
	['Kartoffeln', 'Erdäpfel'],
	['Kartoffel', 'Erdapfel'],
	['Tomaten', 'Paradeiser'],
	['Tomate', 'Paradeiser'],
	['Aprikosen', 'Marillen'],
	['Aprikose', 'Marille'],
	['Pflaumen', 'Zwetschken'],
	['Pflaume', 'Zwetschke'],
	['Blumenkohl', 'Karfiol'],
	['Rosenkohl', 'Kohlsprossen'],
	['Weißkohl', 'Weißkraut'],
	['Rotkohl', 'Rotkraut'],
	['Meerrettich', 'Kren'],
	['Auberginen', 'Melanzani'],
	['Aubergine', 'Melanzani'],
	['Möhren', 'Karotten'],
	['Möhre', 'Karotte'],
	['Puderzucker', 'Staubzucker'],
	['Eiweiß', 'Eiklar'],
	['Eigelb', 'Dotter'],
	['Paniermehl', 'Semmelbrösel'],
	['Pfannkuchen', 'Palatschinken'],
	['Pfifferlinge', 'Eierschwammerl'],
	['Pfifferling', 'Eierschwammerl'],
	['Pilze', 'Schwammerl'],
	['Feldsalat', 'Vogerlsalat'],
	['Rote Bete', 'Rote Rüben'],
	['Rote Beete', 'Rote Rüben'],
	['Johannisbeeren', 'Ribiseln'],
	['Hähnchenbrustfilet', 'Hühnerbrustfilet'],
	['Hähnchenbrust', 'Hühnerbrust'],
	['Hähnchen', 'Hendl'],
	['grüne Bohnen', 'Fisolen'],
	['Kasseler', 'Selchkarree']
];

/** "Sahne" as a whole word — Unicode-aware, because `\b` breaks on ß and umlauts. */
function wholeWord(term: string): RegExp {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
}

const SWAPS = AUSTRIAN_TERMS.map(([from, to]) => ({ pattern: wholeWord(from), to }));

/**
 * One line with the Austrian words in: whole words only (so "Sahnejoghurt"
 * stays), longest phrase first, the Austrian word as it is spelled.
 */
export function austrianWords(line: string): string {
	let out = line;
	for (const { pattern, to } of SWAPS) out = out.replace(pattern, to);
	return out;
}

/**
 * Words that only a German recipe uses — enough of them, and it is one. A list
 * rather than a language detector: the question is only "is this German?",
 * and an English recipe that says "quark" must not come back as "Topfen".
 */
const GERMAN_WORDS = new Set([
	'und',
	'mit',
	'oder',
	'der',
	'das',
	'den',
	'dem',
	'eine',
	'einen',
	'einer',
	'für',
	'etwas',
	'nach',
	'auf',
	'aus',
	'bei',
	'ca',
	'minuten',
	'stunde',
	'stunden',
	'prise',
	'el',
	'tl',
	'salz',
	'pfeffer',
	'zucker',
	'mehl',
	'eier',
	'milch',
	'wasser',
	'zwiebel',
	'zwiebeln',
	'knoblauch',
	'backen',
	'kochen',
	'schneiden',
	'geben',
	'lassen'
]);

export function looksGerman(texts: readonly string[]): boolean {
	const seen = new Set<string>();
	for (const text of texts) {
		for (const word of text.toLowerCase().split(/[^\p{L}]+/u)) {
			if (GERMAN_WORDS.has(word)) seen.add(word);
			if (seen.size >= 3) return true;
		}
	}
	return false;
}

/**
 * A draft's ingredient lines in the household's wording — when it has one and
 * the recipe reads as German; otherwise exactly as they came.
 */
export function applyWording(
	lines: string[],
	steps: readonly string[],
	wording: RecipeWording | null
): string[] {
	if (wording !== 'austrian' || !looksGerman([...lines, ...steps])) return lines;
	return lines.map(austrianWords);
}

/**
 * Every word pair, both ways, compiled once: an "Obers" row also answers to
 * "Sahne", a "Sahne" row to "Obers". The step matcher asks for each ingredient
 * on every keystroke in the editor, so the patterns are built here once and a
 * plain substring test skips the ones that can't apply.
 */
const SYNONYMS = AUSTRIAN_TERMS.flatMap(([from, to]) => [
	{ from: from.toLowerCase(), pattern: wholeWord(from), to },
	{ from: to.toLowerCase(), pattern: wholeWord(to), to: from }
]);

/**
 * The other names an ingredient goes by in the other German — whatever the
 * household chose, because a typed recipe mixes them too (→ step-highlight).
 */
export function wordingSynonyms(name: string): string[] {
	const lower = name.toLowerCase();
	const found: string[] = [];
	for (const { from, pattern, to } of SYNONYMS) {
		if (!lower.includes(from)) continue;
		const swapped = name.replace(pattern, to);
		if (swapped !== name) found.push(swapped);
	}
	return found;
}

/** The glossary line the AI prompt carries for a household that chose Austrian wording. */
export function austrianGlossary(): string {
	return AUSTRIAN_TERMS.map(([from, to]) => `${from} → ${to}`).join('; ');
}
