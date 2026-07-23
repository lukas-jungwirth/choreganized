/**
 * "Sauté the mushrooms in butter" + the recipe's ingredient list → the two
 * words cook mode underlines in amber, and the "This step uses 250 g mushrooms ·
 * butter" line under them [7b].
 *
 * Like the timer chip, this is read rather than authored (→ DECISIONS #14): the
 * recipe form [3c] never asks which ingredients a step uses, so the step text is
 * matched case-insensitively against the ingredient names as typed.
 *
 * Two rules keep the matching honest at arm's length in a kitchen:
 *
 * - **Whole words only.** "oil" must not light up inside "boiling", and "egg"
 *   must not light up inside "eggplant".
 * - **Longest name wins.** A recipe with both "olive oil" and "oil" underlines
 *   "olive oil" as one thing, not "oil" with two orphaned words in front of it.
 *
 * A lenient plural is the one liberty taken — "Mushrooms" matches "mushroom" and
 * the other way round — because a shopping-shaped ingredient list and a
 * sentence disagree about number almost every time.
 */

/** What the caller gets back: run these in order and the step reads as typed. */
export type StepSegment<T> = {
	text: string;
	/** The ingredient this run names, or `null` for ordinary prose. */
	ingredient: T | null;
};

export type StepHighlight<T> = {
	segments: StepSegment<T>[];
	/** Each ingredient the step names, once, in the order it first appears. */
	used: T[];
};

/**
 * Shorter than this and a "name" is noise — a stray "1", a unit that ended up in
 * the name column — that would underline half the sentence.
 */
const MIN_NAME_LENGTH = 3;

/** The recipe form's own row cap; a pathological list can't build a huge regex. */
const MAX_INGREDIENTS = 60;

export function highlightStep<T extends { name: string }>(
	text: string,
	ingredients: readonly T[]
): StepHighlight<T> {
	const plain = [{ text, ingredient: null }];

	// Longest first: at any one position the alternation takes the first branch
	// that matches, so this is what makes "olive oil" beat "oil".
	const candidates = ingredients
		.filter((ingredient) => ingredient.name.trim().length >= MIN_NAME_LENGTH)
		.slice(0, MAX_INGREDIENTS)
		.sort((a, b) => b.name.trim().length - a.name.trim().length);

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
		const ingredient = candidates[which];
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

/**
 * One alternation, one capture group per ingredient — so a match can be traced
 * back to the row it came from without re-testing every name against it.
 *
 * The boundaries are lookarounds over Unicode letters and digits rather than
 * `\b`, which is ASCII-only: `\b` would happily end a match in the middle of
 * "crème fraîche".
 */
function build<T extends { name: string }>(candidates: readonly T[]): RegExp {
	const alternation = candidates.map((c) => `(${pattern(c.name)})`).join('|');
	return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * One name as a pattern: words separated by any whitespace (a line typed with
 * two spaces still matches), and a trailing "s" that may or may not be there.
 *
 * The stem is taken *before* escaping — slicing a character off an escaped
 * string could leave a dangling backslash — and only from a word long enough
 * that dropping its "s" leaves a word behind ("gas" stays "gas"). Doubled "ss"
 * is left alone so "glass" doesn't become "glas".
 */
function pattern(name: string): string {
	const words = name.trim().split(/\s+/);
	const last = words.pop() ?? '';
	const stem =
		last.length > MIN_NAME_LENGTH && /s$/i.test(last) && !/ss$/i.test(last)
			? last.slice(0, -1)
			: last;

	return [...words.map(escape), `${escape(stem)}s?`].join('\\s+');
}

/**
 * `-` is deliberately not escaped: outside a character class it is an ordinary
 * character, and `\-` is an invalid identity escape under the `u` flag.
 */
function escape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
