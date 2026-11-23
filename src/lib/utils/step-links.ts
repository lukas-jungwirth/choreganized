/**
 * A step drawn from its stored links (→ plan 43, SPEC §4.4, DECISIONS #311).
 *
 * A link says which ingredient a step uses, the words of the step text that
 * name it (`phrase`: "Zwiebelwürfel" for the Zwiebel) and the amount the text
 * gives it (`amountPhrase`: "1 - 2 EL"), each exactly as it stands in the text.
 * So nothing here guesses:
 *
 * - **Underlines** are every whole-word occurrence of a link's phrase in this
 *   step, case-blind, with the same Unicode-aware boundaries the matcher uses
 *   (→ `step-highlight.ts`): "Öl" is not underlined inside "Olivenöl".
 * - **Scaled amounts** are the amount phrase, where it stands beside its
 *   words (`locateAmounts`), and nothing else. Cooking for a
 *   different number rewrites every number in that run ("1 - 2 EL" doubled is
 *   "2 - 4 EL"), each scaled by `scaleQuantity` and written back in the style it
 *   was typed (`formatLike`: a fraction stays a fraction, a comma stays a
 *   comma). "180 °C" and "5 - 7 Min." are no link's amount, so they never move.
 * - A phrase or an amount the text no longer contains (the step was retyped)
 *   renders plain; a link to an ingredient that is gone is dropped.
 *
 * `renderStep` is the one entry point for cook mode and the recipe view. It
 * draws from the stored links when the step has any that carry words, and
 * otherwise falls back to exactly what the screens did before plan 43: the
 * matcher (`readStep`) and the "number before an underlined word" rule
 * (`scaleStepAmounts`). That fallback covers both a step nobody has linked
 * (`ingredients_set` false) and one pinned by hand in the old editor, whose
 * pins carry no words (→ DECISIONS #320): a recipe saved before this plan
 * reads and cooks exactly as it did.
 *
 * Pure, no `$lib`, relative imports with their extension (→ `ingredients.ts`).
 */
import {
	COUNTING_WORDS,
	FRACTION_CHARS,
	measureKey,
	NUMBER_PATTERN,
	parseQuantity,
	UNIT_WORDS
} from './amounts.ts';
import { scaleQuantity } from './ingredients.ts';
import { formatLike, rewrite, scaleStepAmounts } from './step-amounts.ts';
import {
	highlightStep,
	readStep,
	scaleStepUses,
	type StepHighlight,
	type StepSegment,
	type StepUse
} from './step-highlight.ts';

type Row = { id: string; name: string; quantity: number | null; unit: string | null };

export type RenderedStep<T> = StepHighlight<T> & {
	/** True when the step was drawn from stored links rather than read by the matcher. */
	linked: boolean;
};

/** Whether a step's pins carry the words that name them (→ plan 43). */
export function hasStoredLinks(uses: readonly StepUse[] | null): boolean {
	return uses !== null && uses.some((use) => Boolean(use.phrase || use.amountPhrase));
}

/**
 * A step as the screens draw it, for `factor` times the recipe as written.
 * `ingredients` is the list already scaled by the same factor (each row's
 * total); `uses` is the step's pins as stored, unscaled.
 */
export function renderStep<T extends Row>(
	step: { text: string; uses: readonly StepUse[] | null },
	ingredients: readonly T[],
	factor: number
): RenderedStep<T> {
	const uses = scaleStepUses(step.uses, factor);

	if (!uses || !hasStoredLinks(uses)) {
		const read = readStep({ text: step.text, uses }, ingredients);
		return {
			segments: scaleStepAmounts(read.segments, factor, ingredients, uses !== null),
			used: read.used,
			linked: false
		};
	}

	return { ...linkStep(step.text, uses, ingredients, factor), linked: true };
}

/**
 * A run of the text that one link claims: the words naming it, or its amount.
 * `unnamed` marks an underline the matcher found for a link stored without
 * words; with no amount phrase of its own, plan 23's rule scales the number
 * before it.
 */
type Claim<T> = {
	start: number;
	end: number;
	ingredient: T | null;
	amount: boolean;
	unnamed?: boolean;
};

/**
 * The step drawn from its links alone. `uses` are already scaled (each pin's
 * share), `ingredients` too; `factor` decides whether the amount runs move.
 */
export function linkStep<T extends Row>(
	text: string,
	uses: readonly StepUse[],
	ingredients: readonly T[],
	factor: number
): StepHighlight<T> {
	const byId = new Map(ingredients.map((row) => [row.id, row]));
	/**
	 * One row per ingredient, carrying this step's share: the shares of all its
	 * links added up (one ingredient may be linked under two phrases), or the
	 * whole row when none of them says.
	 */
	const rows = new Map<string, T>();

	for (const use of uses) {
		const row = byId.get(use.ingredientId);
		if (!row || rows.has(row.id)) continue;
		const share = stepShare(uses, row.id);
		rows.set(row.id, share === null ? row : { ...row, quantity: share });
	}

	const claims: Claim<T>[] = [];
	const scaling = factor !== 1 && Number.isFinite(factor) && factor > 0;

	for (const use of uses) {
		const row = rows.get(use.ingredientId);
		if (!row) continue;

		const phrases = use.phrase ? occurrences(text, use.phrase) : [];
		for (const [start, end] of phrases) claims.push({ start, end, ingredient: row, amount: false });

		if (scaling && use.amountPhrase) {
			for (const [start, end] of amountsBeside(text, phrases, use.amountPhrase)) {
				claims.push({ start, end, ingredient: null, amount: true });
			}
		}
	}

	// A link stored without words still names its ingredient wherever the text
	// says its name: the matcher, restricted to those rows, underlines it there,
	// but never across a run a stored link has already claimed.
	const unnamed = [
		...new Set(uses.filter((use) => !use.phrase).flatMap((use) => rows.get(use.ingredientId) ?? []))
	];
	if (unnamed.length) {
		const found = new Map<string, [number, number][]>();
		let at = 0;
		for (const segment of highlightStep(text, unnamed).segments) {
			const start = at;
			at += segment.text.length;
			if (!segment.ingredient) continue;
			const free = claims.every((claim) => claim.end <= start || claim.start >= at);
			if (!free) continue;
			claims.push({ start, end: at, ingredient: segment.ingredient, amount: false, unnamed: true });
			found.set(segment.ingredient.id, [...(found.get(segment.ingredient.id) ?? []), [start, at]]);
		}

		// Their amount phrases, beside the words the matcher found.
		for (const use of uses) {
			if (!scaling || use.phrase || !use.amountPhrase) continue;
			for (const [start, end] of amountsBeside(
				text,
				found.get(use.ingredientId) ?? [],
				use.amountPhrase
			)) {
				claims.push({ start, end, ingredient: null, amount: true });
			}
		}
	}
	/**
	 * Ingredients linked without words and without an amount phrase: plan 23's
	 * rule reads the number before their underline, as for a step pinned by hand.
	 */
	const withAmount = new Set(
		uses.filter((use) => !use.phrase && use.amountPhrase).map((use) => use.ingredientId)
	);
	const guessed = new Set(
		uses
			.filter((use) => !use.phrase && !use.amountPhrase && !withAmount.has(use.ingredientId))
			.map((use) => use.ingredientId)
	);

	// Left to right; at one position the longer run wins, and a run that starts
	// inside one already taken is dropped rather than splitting it.
	claims.sort((a, b) => a.start - b.start || b.end - a.end);

	const segments: StepSegment<T>[] = [];
	const used: T[] = [];
	let cursor = 0;

	for (const claim of claims) {
		if (claim.start < cursor) continue;
		if (claim.start > cursor)
			segments.push({ text: text.slice(cursor, claim.start), ingredient: null });

		const written = text.slice(claim.start, claim.end);
		if (claim.amount) {
			const now = scaleAmountPhrase(written, factor);
			segments.push(
				now === written
					? { text: written, ingredient: null }
					: { text: now, ingredient: null, scaledFrom: written }
			);
		} else {
			const before = segments.at(-1);
			const row = claim.ingredient;
			if (
				scaling &&
				claim.unnamed &&
				row &&
				guessed.has(row.id) &&
				before &&
				!before.ingredient &&
				!before.scaledFrom
			) {
				const split = rewrite<T>(
					before.text,
					row,
					byId.get(row.id)?.quantity ?? null,
					factor,
					true
				);
				if (split) segments.splice(segments.length - 1, 1, ...split);
			}
			segments.push({ text: written, ingredient: row });
		}
		cursor = claim.end;
	}

	if (cursor < text.length || !segments.length) {
		segments.push({ text: text.slice(cursor), ingredient: null });
	}

	// Every linked row is used, named in the text or not, in the order linked.
	for (const row of rows.values()) used.push(row);

	return { segments: merge(segments), used };
}

/**
 * A step's share of one ingredient across all its links: the shares that say
 * one, added up; null (all of it) when none does.
 */
export function stepShare(
	uses: readonly { ingredientId: string; quantity: number | null }[],
	ingredientId: string
): number | null {
	const shares = uses
		.filter((use) => use.ingredientId === ingredientId && use.quantity !== null)
		.map((use) => use.quantity as number);
	return shares.length ? Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

/**
 * An amount phrase with every number in it scaled: "1 - 2 EL" × 2 → "2 - 4 EL",
 * "½ TL" × 2 → "1 TL", "0,5 l" × 3 → "1,5 l". A number that doesn't read is
 * left as it stands; the words around the numbers never change.
 */
export function scaleAmountPhrase(phrase: string, factor: number): string {
	if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return phrase;

	return phrase.replace(NUMBERS, (written) => {
		// "1.200" is twelve hundred or one-point-two depending on who wrote it.
		// A leading 0 is never a thousands group: "0,250 kg" is a decimal.
		if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(written)) return written;
		const value = parseQuantity(written);
		const scaled = value === null ? null : scaleQuantity(value, factor);
		return scaled === null ? written : formatLike(written, scaled);
	});
}

/**
 * Each number in an amount run: a mixed "1 1/2" or "1 ½" first, so it is one
 * number rather than two, then everything `NUMBER_PATTERN` reads.
 */
const NUMBERS = new RegExp(
	String.raw`(?<![\p{N}.,/])(?:\d+\s+\d+\s*\/\s*\d+|\d+\s+[${FRACTION_CHARS}]|${NUMBER_PATTERN})(?![\p{N}])`,
	'gu'
);

/**
 * Where a phrase stands as whole words: not inside a longer word on either
 * side. A hyphen ends a word, except the German one that holds a compound's
 * place ("Ober- und Unterhitze"), as in the matcher.
 */
export function occurrences(text: string, phrase: string): [number, number][] {
	const words = phrase.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return [];

	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}])${words.map(escape).join('\\s+')}(?![\\p{L}\\p{N}]|-(?:\\s|$))`,
		'giu'
	);

	return [...text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);
}

/**
 * Where a link's amount stands in a step (→ plan 43, DECISIONS #320): the
 * occurrences of `amount` that stand **beside** an occurrence of `phrase`,
 * each one claimed by one phrase occurrence at most. Exported because plan
 * 44's import gate decides with the same rule whether an amount phrase is
 * valid: nothing beside any occurrence means the amount isn't there.
 *
 * For each occurrence of the phrase, the amount is looked for **before** it
 * first: the nearest occurrence that ends before the phrase starts, with at
 * most three words of letters between (spaces, hyphens and commas allowed, no
 * digit, no `. ! ? ; :`): "2 große Eier", "100 g weiche Butter", "2 große,
 * reife Tomaten". "Nach 5 Min. die 5 reifen Tomaten" finds the second 5.
 * Only when there is none, **after** it by the same test, an opening bracket
 * also allowed between: "Karotten (400 g)", "Karotten, etwa 400 g". Never
 * "the first one anywhere": an unscaled number is acceptable, a wrong one is
 * not. An amount is bounded on both sides, so "2 EL" is not read in "12 EL".
 */
export function locateAmounts(text: string, phrase: string, amount: string): [number, number][] {
	return amountsBeside(text, occurrences(text, phrase), amount);
}

function amountsBeside(
	text: string,
	phrases: readonly [number, number][],
	amount: string
): [number, number][] {
	const words = amount.trim().split(/\s+/).filter(Boolean);
	if (!words.length || !phrases.length) return [];

	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}.,/])${words.map(escape).join('\\s+')}(?![\\p{L}\\p{N}])`,
		'giu'
	);
	const found = [...text.matchAll(pattern)].map(
		(match) => [match.index, match.index + match[0].length] as [number, number]
	);
	if (!found.length) return [];

	// Each phrase occurrence's choice, and how far away it is.
	const wanted = phrases.flatMap(([start, end]) => {
		const before = found
			.filter(([, amountEnd]) => amountEnd <= start && beside(text.slice(amountEnd, start), false))
			.at(-1);
		if (before) return [{ amount: before, distance: start - before[1] }];
		const after = found.find(
			([amountStart]) => amountStart >= end && beside(text.slice(end, amountStart), true)
		);
		return after ? [{ amount: after, distance: after[0] - end }] : [];
	});

	// An amount wanted by two occurrences goes to the nearer one.
	const claimed = new Map<number, { amount: [number, number]; distance: number }>();
	for (const choice of wanted) {
		const held = claimed.get(choice.amount[0]);
		if (!held || choice.distance < held.distance) claimed.set(choice.amount[0], choice);
	}

	return [...claimed.values()].map((choice) => choice.amount).sort((a, b) => a[0] - b[0]);
}

/** Whether what stands between an amount and its word lets them belong together. */
export function beside(between: string, after: boolean): boolean {
	const allowed = after ? /^[\p{L}\s,(-]*$/u : /^[\p{L}\s,-]*$/u;
	if (!allowed.test(between)) return false;
	return (between.match(/\p{L}+/gu) ?? []).length <= 3;
}

/* ── The editor's side: tappable words, suggestions, an amount with its word ── */

/**
 * One piece of a step's text as the link sheet shows it (→ plan 46): a word
 * that can be linked, an amount that can follow the number of people, or a
 * time, temperature or length ("2 - 3 Min.", "180 °C", "2 cm"), which is never
 * an amount and is not tappable. Everything between tokens is plain text.
 */
export type StepToken = {
	start: number;
	end: number;
	text: string;
	kind: 'word' | 'amount' | 'fixed';
};

/** A number with an optional range tail: "200", "1,5", "½", "1 - 2", "2 bis 3". */
const RANGE = String.raw`(?:${NUMBER_PATTERN})(?:\s*(?:[-–—]|bis|to)\s*(?:${NUMBER_PATTERN}))?`;

/** What makes a number a time, a temperature or a length rather than an amount. */
const FIXED_WORDS = String.raw`°\s*[CF]?|grad|degrees?|min(?:uten?|utes?|s)?\.?|std\.?|stunden?|hours?|hrs?|h|sek(?:unden?)?\.?|seconds?|secs?|cm|mm`;

/** Unit and counting-word spellings, longest first, escaped ("stk." has a dot). */
function unitAlternation(known: ReadonlySet<string> | undefined): string {
	return [...UNIT_WORDS, ...COUNTING_WORDS, ...(known ?? [])]
		.sort((a, b) => b.length - a.length)
		.map(escape)
		.join('|');
}

/**
 * A step's text cut into what the link sheet can tap. `known` is the
 * household's own unit words, lowercased, so "2 Kugel" is one amount.
 */
export function tokens(text: string, known?: ReadonlySet<string>): StepToken[] {
	const pattern = new RegExp(
		String.raw`(?<fixed>(?<![\p{L}\p{N}.,/])${RANGE}\s*(?:${FIXED_WORDS})(?![\p{L}]))` +
			String.raw`|(?<amount>(?<![\p{L}\p{N}.,/])${RANGE}(?:\s?(?:${unitAlternation(known)})(?![\p{L}]))?)` +
			String.raw`|(?<word>\p{L}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*)*)`,
		'giu'
	);
	return [...text.matchAll(pattern)].map((match) => {
		const groups = match.groups ?? {};
		const kind = groups.fixed ? 'fixed' : groups.amount ? 'amount' : 'word';
		return { start: match.index, end: match.index + match[0].length, text: match[0], kind };
	});
}

/** An amount token read: its first and its largest number, and its unit word. */
export type ReadAmount = { first: number | null; most: number | null; unit: string | null };

/** "1 - 2 EL" → 1, 2, "EL"; "200 g" → 200, 200, "g"; "3" → 3, 3, null. */
export function readAmount(written: string): ReadAmount {
	const numbers = [...written.matchAll(NUMBERS)].map((match) => parseQuantity(match[0]));
	const unit = written
		.replace(NUMBERS, ' ')
		.replace(/[-–—]|(?<![\p{L}])(?:bis|to)(?![\p{L}])/giu, ' ')
		.trim();
	const values = numbers.filter((value): value is number => value !== null);
	return {
		first: numbers[0] ?? null,
		most: values.length ? Math.max(...values) : null,
		unit: unit || null
	};
}

/** What a unit word measures, for comparing: the reader's key, else the word itself. */
function unitKey(word: string | null | undefined): string | null {
	if (!word) return null;
	const key = measureKey(word) ?? word.trim().toLowerCase();
	// "2 Eier" counts pieces as surely as "2 Stk. Eier" does.
	return key === 'pcs' ? null : key;
}

/**
 * The amount token standing **beside** the word at `[start, end)` by the rule
 * cook mode rewrites by (`locateAmounts`): the nearest one before it with at
 * most three words between, else the first after it. Null when there is none.
 */
export function amountBeside(
	text: string,
	all: readonly StepToken[],
	start: number,
	end: number
): StepToken | null {
	const amounts = all.filter((token) => token.kind === 'amount');
	const before = amounts
		.filter((token) => token.end <= start && beside(text.slice(token.end, start), false))
		.at(-1);
	if (before) return before;
	return (
		amounts.find((token) => token.start >= end && beside(text.slice(end, token.start), true)) ??
		null
	);
}

/** A row the editor links to: the form's own key, and what the row says. */
export type LinkTarget = {
	key: string;
	name: string;
	quantity: number | null;
	unit: string | null;
};

/** A link as the editor holds it (→ plan 43's columns): which row, the words, the share. */
export type EditorLink = {
	ingredient: string;
	phrase: string | null;
	amountPhrase: string | null;
	quantity: number | null;
};

/**
 * What an amount in the text says about a row it stands beside: whether it
 * may follow the number of people on its own (its unit is the row's, and it
 * is not more than the row's total), and the step's share it stands for (null
 * when it is all of the row, or a range, or another unit).
 */
export function amountFits(
	written: string,
	row: Pick<LinkTarget, 'quantity' | 'unit'>
): { fits: boolean; share: number | null } {
	const read = readAmount(written);
	if (read.most === null || row.quantity === null) return { fits: false, share: null };
	if (unitKey(read.unit) !== unitKey(row.unit)) return { fits: false, share: null };
	if (read.most > row.quantity * 1.005) return { fits: false, share: null };
	const single = read.first !== null && read.first === read.most;
	return { fits: true, share: single && read.most < row.quantity ? read.most : null };
}

/**
 * Whether `amount` is the run cook mode will rewrite for the link `phrase`:
 * `locateAmounts` finds it beside one of the phrase's occurrences.
 */
export function amountFollows(text: string, phrase: string, amount: StepToken): boolean {
	return locateAmounts(text, phrase, amount.text).some(([at]) => at === amount.start);
}

/**
 * A new link for the word at `[start, end)`: the word as written, and the
 * amount beside it when that amount fits the row (→ plan 46: "400 g Karotten"
 * links the 400 g with the word). An amount that does not fit is left for a
 * person to link by hand. The amount is kept only where cook mode will find it.
 */
export function linkWord(
	text: string,
	all: readonly StepToken[],
	start: number,
	end: number,
	row: LinkTarget
): EditorLink {
	const phrase = text.slice(start, end);
	const amount = amountBeside(text, all, start, end);
	const fit = amount ? amountFits(amount.text, row) : null;
	const found = amount !== null && fit !== null && fit.fits && amountFollows(text, phrase, amount);
	return {
		ingredient: row.key,
		phrase,
		amountPhrase: found ? amount.text : null,
		quantity: found ? fit.share : null
	};
}

/** A word the matcher would link, offered rather than linked (→ plan 46). */
export type LinkSuggestion = {
	ingredient: string;
	phrase: string;
	start: number;
	end: number;
};

/**
 * The words of a step the matcher recognises (`highlightStep`), as
 * suggestions: one per row, the first place the text names it. A row this
 * step already links is never suggested again, nor is a word inside a linked
 * phrase, nor a phrase in `dismissed` (compared without case). A compound
 * ("Zwiebelwürfel") is suggested for nothing: the matcher reads whole words.
 */
export function suggestLinks(
	text: string,
	ingredients: readonly LinkTarget[],
	links: readonly Pick<EditorLink, 'ingredient' | 'phrase'>[],
	dismissed: readonly string[] = []
): LinkSuggestion[] {
	const linked = new Set(links.map((link) => link.ingredient));
	const taken = links.flatMap((link) => (link.phrase ? occurrences(text, link.phrase) : []));
	const skip = new Set(dismissed.map((phrase) => phrase.toLowerCase()));
	const open = ingredients.filter((row) => !linked.has(row.key));

	const found: LinkSuggestion[] = [];
	let at = 0;
	for (const segment of highlightStep(text, open).segments) {
		const start = at;
		at += segment.text.length;
		const row = segment.ingredient;
		if (!row || found.some((one) => one.ingredient === row.key)) continue;
		if (taken.some(([from, to]) => from < at && to > start)) continue;
		if (skip.has(segment.text.toLowerCase())) continue;
		found.push({ ingredient: row.key, phrase: segment.text, start, end: at });
	}
	return found;
}

/** Neighbouring plain runs as one, so the screens render what they did before. */
function merge<T>(segments: StepSegment<T>[]): StepSegment<T>[] {
	const out: StepSegment<T>[] = [];
	for (const segment of segments) {
		const last = out.at(-1);
		if (
			last &&
			!last.ingredient &&
			!segment.ingredient &&
			!last.scaledFrom &&
			!segment.scaledFrom
		) {
			last.text += segment.text;
		} else {
			out.push({ ...segment });
		}
	}
	const kept = out.filter((segment) => segment.text);
	return kept.length ? kept : [{ text: '', ingredient: null }];
}

/** `-` stays unescaped: an identity escape is invalid under the `u` flag. */
function escape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
