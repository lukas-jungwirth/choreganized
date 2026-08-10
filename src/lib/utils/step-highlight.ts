/**
 * "Sauté the mushrooms in butter" + the recipe's ingredient list → the two
 * words cook mode underlines in amber, and the "This step uses 250 g mushrooms ·
 * butter" line under them [7b].
 *
 * There are two ways a step knows what it uses (→ SPEC §4.4, DECISIONS #127):
 *
 * - **Authored.** The form [3c] pins ingredients to a step, optionally with the
 *   share of each that goes in *here* — 1 of the 3 tbsp of olive oil now, 2 at
 *   the end. That list is the answer, even when it is empty, and `readStep`
 *   hands it back untouched.
 * - **Read out of the text**, which is what every step does until someone says
 *   otherwise, and what an imported recipe [plan 12] gets for free.
 *
 * The reading is deliberately more forgiving than an exact match, because an
 * ingredient list and a sentence rarely agree word for word:
 *
 * - **Whole words only.** "oil" must not light up inside "boiling", and "egg"
 *   must not light up inside "eggplant".
 * - **Longest wins.** A recipe with both "olive oil" and "oil" underlines
 *   "olive oil" as one thing, not "oil" with two orphaned words in front of it.
 * - **The descriptors are optional.** "1 small red onion" is written down as
 *   "small red onion" and referred to as "the onion", so every ingredient also
 *   answers to its tail — and to itself with the "(finely chopped)" trimmed off.
 * - **Number is forgiven**, in both languages: "Mushrooms" matches "mushroom",
 *   "Tomaten" matches "Tomate", "berries" matches "berry".
 * - **Ambiguity is silence.** The shortened forms are only offered while they
 *   name one thing: a recipe with both "olive oil" and "sunflower oil" gets no
 *   "oil", and one with "red pepper" beside plain "pepper" gives the word to the
 *   ingredient actually called that. Guessing wrong here is worse than not
 *   guessing — and the form is where a cook settles it for good.
 */
// Written with its extension for the same reason `ingredients.ts` is: `node
// --test` only strips types, it does not resolve a bare './ingredients'.
import { scaleQuantity } from './ingredients.ts';

/** What the caller gets back: run these in order and the step reads as typed. */
export type StepSegment<T> = {
	text: string;
	/** The ingredient this run names, or `null` for ordinary prose. */
	ingredient: T | null;
};

export type StepHighlight<T> = {
	segments: StepSegment<T>[];
	/** Each ingredient the step uses, once — in reading order, or as pinned. */
	used: T[];
};

/** One pinned ingredient: which row, and how much of it this step wants. */
export type StepUse = {
	ingredientId: string;
	/** In the ingredient's own unit; null = whatever the ingredient row says. */
	quantity: number | null;
};

/**
 * Shorter than this and a "name" is noise — a stray "1", a unit that ended up in
 * the name column — that would underline half the sentence.
 */
const MIN_NAME_LENGTH = 3;

/** The recipe form's own row cap; a pathological list can't build a huge regex. */
const MAX_INGREDIENTS = 60;

/**
 * How many leading words an ingredient may shed. Three covers the longest thing
 * anyone writes on a shopping line — "2 small red bell peppers" → "peppers" —
 * without turning a sentence-long name into a single common word.
 */
const MAX_DROPPED_WORDS = 3;

/**
 * A step and its ingredients, however it knows them. The one entry point cook
 * mode and the form both use; `highlightStep` below is the reading half.
 *
 * A pinned ingredient that no longer exists (deleted from the list on another
 * phone) is dropped rather than rendered as a gap, and one with its own amount
 * comes back carrying it — so "This step uses 1 tbsp olive oil" and the peek
 * sheet both say the step's share rather than the recipe's total.
 */
export function readStep<T extends { id: string; name: string; quantity: number | null }>(
	step: { text: string; uses: readonly StepUse[] | null },
	ingredients: readonly T[]
): StepHighlight<T> {
	if (!step.uses) return highlightStep(step.text, ingredients);

	const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
	const used: T[] = [];

	for (const use of step.uses) {
		const ingredient = byId.get(use.ingredientId);
		if (!ingredient || used.some((row) => row.id === ingredient.id)) continue;
		used.push(use.quantity === null ? ingredient : { ...ingredient, quantity: use.quantity });
	}

	// Underlined against the pinned list only: a word the cook took *off* this
	// step must not keep its amber line.
	return { segments: highlightStep(step.text, used).segments, used };
}

/** The step's own amounts, written out for a different number of people. */
export function scaleStepUses(uses: readonly StepUse[] | null, factor: number): StepUse[] | null {
	if (!uses) return null;
	return uses.map((use) => ({ ...use, quantity: scaleQuantity(use.quantity, factor) }));
}

export function highlightStep<T extends { name: string }>(
	text: string,
	ingredients: readonly T[]
): StepHighlight<T> {
	const plain = [{ text, ingredient: null }];
	const candidates = resolve(ingredients);

	if (!text || candidates.length === 0) return { segments: plain, used: [] };

	let matcher: RegExp;
	try {
		matcher = build(candidates);
	} catch {
		// An ingredient name is free text; if one of them somehow escapes into an
		// invalid pattern, the step still has to render.
		return { segments: plain, used: [] };
	}

	const segments: StepSegment<T>[] = [];
	const used: T[] = [];
	let cursor = 0;

	for (const match of text.matchAll(matcher)) {
		// Group `i + 1` belongs to `candidates[i]`; exactly one of them is set.
		const which = match.findIndex((group, index) => index > 0 && group !== undefined) - 1;
		const ingredient = candidates[which]?.ingredient;
		if (!ingredient) continue;

		if (match.index > cursor) {
			segments.push({ text: text.slice(cursor, match.index), ingredient: null });
		}

		segments.push({ text: match[0], ingredient });
		if (!used.includes(ingredient)) used.push(ingredient);

		cursor = match.index + match[0].length;
	}

	if (cursor < text.length) segments.push({ text: text.slice(cursor), ingredient: null });

	return { segments, used };
}

/* ── What each ingredient answers to ──────────────────────────────────────── */

/**
 * One name an ingredient may be called by. `rank` is how far it is from the name
 * as typed (0 = exactly that), which is what settles a clash: the ingredient
 * actually called "pepper" keeps the word, and two ingredients that only *both*
 * shorten to "oil" neither of them do. `owner` is the ingredient's own key, so a
 * clash between two rows that are the same thing can be told from a real one.
 */
type Candidate<T> = { ingredient: T; text: string; key: string; owner: string; rank: number };

function resolve<T extends { name: string }>(ingredients: readonly T[]): Candidate<T>[] {
	const claims = new Map<string, Candidate<T>[]>();

	for (const ingredient of ingredients.slice(0, MAX_INGREDIENTS)) {
		for (const candidate of aliases(ingredient)) {
			const claimed = claims.get(candidate.key);
			if (claimed) claimed.push(candidate);
			else claims.set(candidate.key, [candidate]);
		}
	}

	const kept: Candidate<T>[] = [];

	for (const claimants of claims.values()) {
		const best = Math.min(...claimants.map((candidate) => candidate.rank));
		const closest = claimants.filter((candidate) => candidate.rank === best);

		// Nobody else wants the word, or the ingredient actually called that is
		// among the claimants — an exact name beats every shortening of another.
		// A recipe listing "Prise Salz" twice (imports do) is still one salt, so
		// rows that are the same thing don't argue over their own word; two
		// *different* things that only shorten to "oil" name nothing in
		// particular, and the step is left alone.
		const single = closest.length === 1;
		const sameThing = closest.every((candidate) => candidate.owner === closest[0].owner);

		if (single || best === 0 || sameThing) kept.push(closest[0]);
	}

	// Longest first: at any one position the alternation takes the first branch
	// that matches, so this is what makes "olive oil" beat "oil".
	return kept.sort((a, b) => b.text.length - a.text.length);
}

/** Every form of an ingredient's name, nearest the typed one first. */
function aliases<T extends { name: string }>(ingredient: T): Candidate<T>[] {
	const written = ingredient.name.trim().replace(/\s+/g, ' ');
	const owner = keyOf(written);
	const found: Candidate<T>[] = [];
	const seen = new Set<string>();

	const offer = (text: string, rank: number) => {
		if (text.length < MIN_NAME_LENGTH) return;
		const key = keyOf(text);
		if (!key || seen.has(key)) return;
		seen.add(key);
		found.push({ ingredient, text, key, owner, rank });
	};

	offer(written, 0);

	// "Olive oil (extra virgin), warmed" is written down whole and referred to as
	// "the olive oil"; the brackets and everything after the comma are the note.
	const plain = written
		.replace(/\([^)]*\)/g, ' ')
		.split(/[,;]/)[0]
		.replace(/\s+/g, ' ')
		.trim();

	offer(plain, 1);

	// "small red onion" → "red onion" → "onion". Never the last word away: an
	// ingredient with nothing left is an ingredient with no name.
	const words = plain.split(' ');
	for (let dropped = 1; dropped <= Math.min(MAX_DROPPED_WORDS, words.length - 1); dropped++) {
		offer(words.slice(dropped).join(' '), dropped + 1);
	}

	return found;
}

/**
 * What two names have to share to be the same claim: lowercase, and the last
 * word singular, so "Tomaten" and "tomato" do not both get to be the answer.
 */
function keyOf(text: string): string {
	const words = text.toLowerCase().split(' ');
	const last = words.pop() ?? '';
	return [...words, singular(last)].join(' ');
}

/* ── Matching ─────────────────────────────────────────────────────────────── */

/**
 * One alternation, one capture group per candidate — so a match can be traced
 * back to the row it came from without re-testing every name against it.
 *
 * The boundaries are lookarounds over Unicode letters and digits rather than
 * `\b`, which is ASCII-only: `\b` would happily end a match in the middle of
 * "crème fraîche".
 */
function build<T>(candidates: readonly Candidate<T>[]): RegExp {
	const alternation = candidates.map((c) => `(${pattern(c.text)})`).join('|');
	return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * One name as a pattern: words separated by any whitespace (a line typed with
 * two spaces still matches), and the last one in whichever number the sentence
 * happens to use.
 */
function pattern(text: string): string {
	const words = text.split(' ');
	const last = words.pop() ?? '';

	return [...words.map(escape), numbers(last)].join('\\s+');
}

/**
 * "onion" ⇄ "onions", "Zwiebel" ⇄ "Zwiebeln", "berry" ⇄ "berries" — the surface
 * forms of one word, longest first so the alternation prefers the fuller one.
 *
 * Both languages, because a household types in whichever is to hand and the
 * ingredient list is written like a shopping note while the step is written like
 * a sentence. The extra forms this generates for words that are neither ("baco",
 * from a stem that was never a plural) cost nothing: they are whole words that
 * do not exist, so nothing matches them.
 */
function numbers(word: string): string {
	const stem = singular(word);
	const forms = new Set([word, stem, `${stem}s`, `${stem}n`]);

	if (/[sxzo]$/i.test(stem) || /(?:ch|sh)$/i.test(stem)) forms.add(`${stem}es`);
	if (/y$/i.test(stem)) forms.add(`${stem.slice(0, -1)}ies`);

	const alternation = [...forms]
		.sort((a, b) => b.length - a.length)
		.map(escape)
		.join('|');

	return `(?:${alternation})`;
}

/**
 * A word without its plural, as far as a recipe needs one. Never shorter than
 * `MIN_NAME_LENGTH`, and never at the price of a word that ends that way on its
 * own: "gas" stays "gas", "glass" stays "glass", and "onion" is not the plural
 * of "onio" — the German -n only comes off when what is left could be a German
 * singular ("Zwiebeln" → "Zwiebel", "Tomaten" → "Tomate").
 */
function singular(word: string): string {
	if (word.length <= MIN_NAME_LENGTH) return word;

	if (/[^aeiou]ies$/i.test(word)) return `${word.slice(0, -3)}y`;
	if (/(?:ch|sh|[sxzo])es$/i.test(word)) return word.slice(0, -2);
	if (/s$/i.test(word) && !/ss$/i.test(word)) return word.slice(0, -1);
	if (/[eilr]n$/i.test(word)) return word.slice(0, -1);

	return word;
}

/**
 * `-` is deliberately not escaped: outside a character class it is an ordinary
 * character, and `\-` is an invalid identity escape under the `u` flag.
 */
function escape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
