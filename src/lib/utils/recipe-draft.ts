/**
 * A model's recipe → a draft a person checks, or a refusal (→ plans 22, 44,
 * SPEC §4.7, DECISIONS #148, #311).
 *
 * **The gate.** The model structures; this checks its answer against what it
 * was sent, in plain code, and turns whatever fails into a **check item** for
 * a person rather than a saved guess. Everything here assumes the answer is
 * hostile and keeps only what passes, row by row:
 *
 * 1. **Shape** — not an object at all is the one outright refusal (the
 *    provider's fault, so the backup gets a turn). A wrong-typed row is dropped.
 * 2. **Strings and numbers** — control and bidi characters, HTML, markdown and
 *    links out; every field capped by the form's own limits; amounts finite,
 *    positive, under the cap; a unit from the eight, a counting word the reader
 *    knows, or one of the household's own (DECISIONS #321).
 * 3. **Ingredients, against the page's card**: a row whose `source` is not a
 *    page line is an invention and goes (unless the household's instructions
 *    asked for changes); a page line no row came from is added from the rules
 *    (`line-added`); the page's amount and the page's words win over the
 *    model's (`amount-differs`, `name-differs`); a word the page counts in that
 *    is on no list is a question (`new-unit`), an either/or a choice (`choice`).
 * 4. **Steps** — every kept sentence must be the page's, word for word and in
 *    order (`reworded` otherwise); more than a third reworded is a refusal
 *    (`fidelity`): the backup gets a turn, then the rule-based draft. What the
 *    model left out of the method is kept as `leftOut`.
 * 5. **Links** — a phrase must stand in its step; an amount phrase beside it,
 *    by the rule cook mode rewrites by (`locateAmounts`), in the row's unit and
 *    not more than the row; an exact name nobody linked is linked;
 *    `shares-exceed`, `unused`.
 * 6. **Timers** — only where the step's own text states that duration.
 * 7. **Tags** — only keys on the app's list (→ plan 41).
 *
 * Save then checks everything again (`readRecipeForm`, the service's clamps).
 * Pure, so the whole policy is unit-tested (→ `recipe-draft.test.ts`).
 */
import { householdUnitKey, leadingAmount, measureKey, rangeLength, unitStem } from './amounts';
import { formatIngredient, RECIPE_QUANTITY_MAX, RECIPE_UNITS } from './ingredients';
import {
	clampCount,
	INGREDIENT_LINE_MAX,
	INGREDIENT_NAME_MAX,
	INGREDIENT_NOTE_MAX,
	INGREDIENTS_MAX,
	AMOUNT_PHRASE_MAX,
	LINK_PHRASE_MAX,
	RECIPE_NAME_MAX,
	RECIPE_SECTION_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEP_TEXT_MAX,
	STEPS_MAX,
	type ImportCheck,
	type LeftOut,
	type RecipePrefill,
	type StepInput,
	type StepLinkInput,
	type StepTimer
} from './recipes';
import { readRecipeDiet, readRecipeTags, type RecipeDiet, type RecipeTag } from './recipe-tags';
import { recipeChecks, ruleRow, splitLongStep, type SourceRecipe } from './rule-draft';
import type { UnitLabels } from './shopping';
import { locateAmounts, occurrences } from './step-links';
import {
	MAX_TIMER_SECONDS,
	MIN_TIMER_SECONDS,
	stepDurations,
	TIMER_LABEL_MAX
} from './timer-parse';

export type { SourceRecipe } from './rule-draft';

export type DraftContext = {
	/** The page's card the model was shown; absent for a paste, a no-card page or photos. */
	source?: SourceRecipe | null;
	/** The text the model was shown: a page's readable text, or a paste. */
	text?: string | null;
	/** Read from photos: nothing to check against. */
	photos?: boolean;
	/** Whether the household asked for changes — then rows and steps may legitimately differ. */
	instructed: boolean;
	/** The unit spellings ingredient lines are written back in ("EL", not "tbsp"). */
	labels?: UnitLabels;
	/** The household's own unit words, lowercased (→ `services/units.ts`). */
	known?: ReadonlySet<string>;
};

export type DraftCheck =
	| { ok: true; draft: Omit<RecipePrefill, 'photo'>; dropped: number }
	| {
			ok: false;
			/**
			 * `shape` — not the object asked for (the provider's failure);
			 * `empty` — nothing recipe-like in it (the input's);
			 * `fidelity` — more than a third of the steps are not the page's.
			 */
			reason: 'shape' | 'empty' | 'fidelity';
	  };

type Row = {
	/** Its index in the model's answer; null for a line the gate added. */
	answered: number | null;
	source: number | null;
	quantity: number | null;
	unit: string | null;
	name: string;
	note: string | null;
	section: string | null;
	checks: Omit<ImportCheck, 'at'>[];
};

export function validateRecipeDraft(raw: unknown, context: DraftContext): DraftCheck {
	if (!isRecord(raw)) return { ok: false, reason: 'shape' };

	const card = context.source ?? null;
	const known = context.known ?? new Set<string>();
	const sent = sourceBlob(card, context.text ?? null);
	let dropped = 0;

	// ── Ingredients ──
	const rows: Row[] = [];
	(Array.isArray(raw.ingredients) ? raw.ingredients : []).forEach((item: unknown, at) => {
		const row = isRecord(item) ? readRow(item, at, card, context, known, sent) : null;
		if (!row || rows.length >= INGREDIENTS_MAX) {
			dropped++;
			return;
		}
		rows.push(row);
	});
	// Instructions may change the rows: then the page is no longer the measure.
	if (card && !context.instructed) addMissingLines(rows, card, known);

	const finalIndex = new Map<number, number>();
	rows.forEach((row, at) => {
		if (row.answered !== null) finalIndex.set(row.answered, at);
	});

	// ── Steps ──
	const method = card ? card.steps : context.text ? [context.text] : [];
	const checkSteps = !context.photos && !context.instructed && method.length > 0;
	const haystack = tokens(method.join(' ')).map((token) => token.word);
	// Where each card step starts among those words: a found step knows its card step.
	const cardStarts: number[] = [];
	if (card) {
		let count = 0;
		for (const one of card.steps) {
			cardStarts.push(count);
			count += tokens(one).length;
		}
	}
	const cardStepAt = (word: number) => cardStarts.findLastIndex((start) => start <= word);
	/** The card step each draft step was found in, or -1. */
	const fromCard: number[] = [];
	let cursor = 0;
	let reworded = 0;

	const steps: StepInput[] = [];
	const stepChecks: ImportCheck[] = [];
	// A step longer than the editor holds is several, cut at sentence ends, so a
	// long paragraph keeps its tail (each piece is checked like any step).
	const answered = (Array.isArray(raw.steps) ? raw.steps : []).flatMap((item: unknown) => {
		const whole = isRecord(item)
			? cleanText(item.text, STEP_TEXT_MAX * 10, { numbering: true })
			: cleanText(item, STEP_TEXT_MAX * 10, { numbering: true });
		if (!whole) return [{ item, text: '', piece: 0, pieces: [] as string[] }];
		const pieces = splitLongStep(whole);
		return pieces.map((text, piece) => ({ item, text, piece, pieces }));
	});
	for (const { item, text, piece, pieces } of answered) {
		if (!text || steps.length >= STEPS_MAX) {
			dropped++;
			continue;
		}

		const at = steps.length;
		if (checkSteps) {
			// Word for word: the same words in the same order, punctuation and spacing aside.
			const words = tokens(text).map((token) => token.word);
			const found = words.length ? runAt(haystack, words, cursor) : -1;
			fromCard.push(found >= 0 && card ? cardStepAt(found) : -1);
			if (found >= 0) {
				cursor = found + words.length;
			} else {
				reworded++;
				stepChecks.push({
					kind: 'reworded',
					level: 'check',
					at: { step: at },
					page: closestRun(text, method)
				});
			}
		}

		const record = isRecord(item) ? item : {};
		// A step split into pieces: each link and the timer go to one piece only, the
		// first that names it (or the first piece), so no share is counted twice.
		const mine = (one: unknown) => pieceOf(one, pieces) === piece;
		const uses = Array.isArray(record.uses) ? record.uses.filter(mine) : record.uses;
		const timerPiece =
			pieces.length > 1 ? pieces.findIndex((one) => readTimer(record.timer, one) !== null) : 0;
		steps.push({
			text,
			uses: readLinks(uses, text, rows, finalIndex, known),
			timer: timerPiece === piece ? readTimer(record.timer, text) : null,
			section: readSection(record.section, sent)
		});
	}

	if (checkSteps && steps.length && reworded * 3 > steps.length) {
		return { ok: false, reason: 'fidelity' };
	}
	// Dropping is allowed (greetings, teasers, variations), dropping the method is not:
	// an answer that kept less than half of a card's sentences is no answer to that card.
	const omitted = card && checkSteps ? leftOut(card.steps, steps) : [];
	if (card && checkSteps && omitted.length * 2 > sentences(card.steps).length) {
		return { ok: false, reason: 'fidelity' };
	}

	// ── Recipe ──
	const modelName = cleanText(raw.name, RECIPE_NAME_MAX);
	if (!modelName && !rows.length && !steps.length) return { ok: false, reason: 'empty' };

	let name = modelName;
	let timeMinutes = clampCount(raw.timeMinutes, RECIPE_TIME_MAX);
	let servings = clampCount(raw.servings, RECIPE_SERVINGS_MAX);
	if (card && !context.instructed) {
		// The card's own facts stand; its name may only be shortened.
		const written = card.name.slice(0, RECIPE_NAME_MAX);
		const shortening =
			modelName.length >= 3 && written.toLowerCase().startsWith(modelName.toLowerCase());
		name = shortening ? modelName : written || modelName;
		timeMinutes = clampCount(card.timeMinutes, RECIPE_TIME_MAX) ?? timeMinutes;
		servings = clampCount(card.servings, RECIPE_SERVINGS_MAX) ?? servings;
	}

	// Each row's sections from the card when the model named none: the reader saw them.
	for (const row of rows) {
		if (!row.section && card && row.source !== null) {
			row.section = card.ingredientSections?.[row.source] ?? null;
		}
	}
	if (card) {
		// A step takes the part of the card step it was found in.
		steps.forEach((step, at) => {
			const source = fromCard[at] ?? -1;
			if (!step.section && source >= 0) step.section = card.stepSections?.[source] ?? null;
		});
	}

	const tags = readRecipeTags(Array.isArray(raw.tags) ? raw.tags : []);
	const diet = readRecipeDiet(raw.diet);

	const checks: ImportCheck[] = [
		...(context.photos ? [{ kind: 'from-photo', level: 'info', at: 'recipe' } as const] : []),
		...recipeChecks(servings, card?.servingsText, steps.length),
		...rows.flatMap((row, at) =>
			row.checks.map(
				(check) => ({ ...check, name: row.name, at: { ingredient: at } }) as ImportCheck
			)
		),
		...stepChecks,
		...linkChecks(rows, steps, known)
	];

	return {
		ok: true,
		dropped,
		draft: {
			name,
			timeMinutes,
			servings,
			ingredientLines: rows.map((row) =>
				formatIngredient(row, context.labels).slice(0, INGREDIENT_LINE_MAX)
			),
			ingredientDetails: rows.map((row) => ({ note: row.note, section: row.section })),
			steps,
			suggested: tags.length || diet ? { tags, diet, from: 'ai' } : null,
			checks,
			leftOut: omitted
		}
	};
}

/* ── Ingredients ──────────────────────────────────────────────────────────── */

/** One answered row, checked against its page line; null when it must go. */
function readRow(
	item: Record<string, unknown>,
	answered: number,
	card: SourceRecipe | null,
	context: DraftContext,
	known: ReadonlySet<string>,
	sent: string
): Row | null {
	let name = cleanText(item.name, INGREDIENT_NAME_MAX);
	if (!name) return null;

	const source =
		typeof item.source === 'number' && Number.isInteger(item.source) ? item.source : null;
	const line = card && source !== null ? (card.ingredientLines[source] ?? null) : null;
	// A row the page does not have is an invention, unless the household asked for changes.
	if (card && line === null && !context.instructed) return null;

	let quantity = amount(item.quantity);
	let unit: string | null = isRecipeUnit(item.unit) ? item.unit : null;
	let note = cleanText(item.note, INGREDIENT_NOTE_MAX) || null;
	const checks: Omit<ImportCheck, 'at'>[] = [];
	const where = line ?? context.text ?? '';

	// A counting word must be on the list; one that is not is a new unit.
	let newUnit = cleanText(item.newUnit, 30) || null;
	const counting = cleanText(item.countingWord, 30) || null;
	if (!unit && counting) {
		if (isKnownWord(counting, known)) unit = counting;
		else newUnit = newUnit ?? counting;
	}
	if (newUnit && !unit && contains(where, newUnit)) {
		checks.push({ kind: 'new-unit', level: 'check', word: newUnit });
		note = joinNote(newUnit, note);
	}
	if (quantity === null) unit = null;

	if (line !== null && !context.instructed) {
		const page = ruleRow(line, known);
		if (CONVERTED.test(line)) checks.push({ kind: 'converted', level: 'info', page: line });
		// The page's amount, where the reader reads a number and a unit, stands.
		if (page && page.quantity !== null && page.unit !== null) {
			if (!sameAmount(quantity, unit, page.quantity, page.unit)) {
				// What the model said, so the review can offer it (→ plan 45).
				const answer: NonNullable<ImportCheck['answer']> = {
					quantity,
					unit: quantity === null ? null : unit
				};
				quantity = page.quantity;
				unit = page.unit;
				// A model that put the unit into the name ("Bund Suppengrün") loses it there,
				// and the review's "Use 1" gives it back with the model's amount.
				const [first, ...rest] = name.split(' ');
				if (rest.length && measureKey(first) && measureKey(first) === measureKey(unit)) {
					answer.name = name;
					name = rest.join(' ');
				}
				checks.push({ kind: 'amount-differs', level: 'check', page: line, answer });
			}
		}
		// The page's words, where the model's name says something the line does not.
		if (page && !nameFits(name, line)) {
			name = page.name;
			note = page.note ?? note;
			checks.push({ kind: 'name-differs', level: 'check', page: line });
		}
	}

	const alternative = cleanText(item.alternative, INGREDIENT_NAME_MAX) || null;
	if (alternative && contains(where, alternative)) {
		checks.push({ kind: 'choice', level: 'check', alternative });
		const word = joinerBefore(where, alternative) ?? 'oder';
		note = joinNote(`${word} ${alternative}`, note);
	}

	return {
		answered,
		source: line === null ? null : source,
		quantity,
		unit: quantity === null ? null : unit,
		name,
		note: note ? note.slice(0, INGREDIENT_NOTE_MAX).trim() : null,
		section: readSection(item.section, sent),
		checks
	};
}

/** The page measured in something the app does not: the row was converted. */
const CONVERTED = /\b(?:cups?|oz|ounces?|lbs?|pounds?|°F)\b/i;

/**
 * Every page line must be the source of a row (or be a part's name, which the
 * reader already took out of the lines). A line no row came from is added from
 * the rule-based reading, after the rows of the lines before it.
 */
function addMissingLines(rows: Row[], card: SourceRecipe, known: ReadonlySet<string>): void {
	const covered = new Set(rows.map((row) => row.source));
	card.ingredientLines.forEach((line, source) => {
		if (covered.has(source) || rows.length >= INGREDIENTS_MAX) return;
		const read = ruleRow(line, known);
		if (!read) return;
		const after = rows.findLastIndex((row) => row.source !== null && row.source < source);
		rows.splice(after + 1, 0, {
			answered: null,
			source,
			...read,
			section: card.ingredientSections?.[source] ?? null,
			checks: [{ kind: 'line-added', level: 'check', page: line }]
		});
	});
}

/**
 * Whether every word of a name stands in the page line: compared without case,
 * plural brackets and endings ("Zwiebeln" for "Zwiebel(n)", "Hackfleisch" in
 * "Rinderhackfleisch").
 */
export function nameFits(name: string, line: string): boolean {
	const plural = /\((n|en|e|er|s|es|nen|se)\)|\/(n|en|s)\b/giu;
	// The line both ways: "3 Ei(er)" says "Ei" and "Eier", "2 egg(s)" "egg" and "eggs".
	const page = normalize(
		`${line.replace(plural, '')} ${line.replace(plural, (_, a?: string, b?: string) => a ?? b ?? '')}`
	);
	return words(name.replace(plural, '')).every((word) => page.includes(stem(word)));
}

function stem(word: string): string {
	const lower = word.toLowerCase();
	return lower.length > 4 ? lower.replace(/(?:en|er|es|e|n|s)$/u, '') : lower;
}

function words(text: string): string[] {
	return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Two amounts the same, in the same measure: 1 kg is 1000 g, 2 "Zehen" are 2 "Zehe". */
function sameAmount(
	quantity: number | null,
	unit: string | null,
	pageQuantity: number,
	pageUnit: string
): boolean {
	const a = canonical(quantity, unit);
	const b = canonical(pageQuantity, pageUnit);
	return a !== null && b !== null && a.key === b.key && Math.abs(a.value - b.value) < 0.011;
}

/** An amount in its base measure: g, ml, or the unit's own key. */
function canonical(
	quantity: number | null,
	unit: string | null
): { value: number; key: string } | null {
	if (quantity === null || unit === null) return null;
	const key = measureKey(unit) ?? unitStem(unit);
	if (key === 'kg') return { value: quantity * 1000, key: 'g' };
	if (key === 'L') return { value: quantity * 1000, key: 'ml' };
	return { value: quantity, key };
}

function isKnownWord(word: string, known: ReadonlySet<string>): boolean {
	return measureKey(word) !== null || householdUnitKey(word, known) !== null;
}

/** "oder"/"or" as the text writes it just before the alternative: "Hack oder veganes Hack". */
function joinerBefore(where: string, alternative: string): string | null {
	const at = normalize(where).indexOf(normalize(alternative));
	if (at < 0) return null;
	return /\b(oder|or)\s*$/i.exec(normalize(where).slice(Math.max(0, at - 12), at))?.[1] ?? null;
}

function joinNote(first: string, note: string | null): string {
	return note ? `${first}, ${note}` : first;
}

/* ── Steps ────────────────────────────────────────────────────────────────── */

/**
 * The page's method compared as a person reads it: whitespace collapsed,
 * typographic quotes and dashes as plain ones, case ignored.
 */
function normalize(text: string): string {
	return text
		.replace(/[‘’‚‛]/g, "'")
		.replace(/[“”„‟«»]/g, '"')
		.replace(/[‐‑‒–—]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/** The page's sentences, one by one. */
function sentences(method: readonly string[]): string[] {
	return method.flatMap((text) =>
		text
			.split(/(?<=[.!?])\s+/)
			.map((one) => one.trim())
			.filter(Boolean)
	);
}

/** The page sentence a reworded step most likely was: the most words in common. */
function closestSentence(text: string, method: readonly string[]): string | undefined {
	const mine = new Set(words(text.toLowerCase()));
	let best: { sentence: string; score: number } | null = null;
	for (const sentence of sentences(method)) {
		const score = words(sentence.toLowerCase()).filter((word) => mine.has(word)).length;
		if (score > 0 && (!best || score > best.score)) best = { sentence, score };
	}
	return best?.sentence;
}

/**
 * The page's words for a reworded step, sentence by sentence: the review
 * offers them in its place (→ plan 45), so a step of two sentences must not
 * come back as one.
 */
function closestRun(text: string, method: readonly string[]): string | undefined {
	const found = sentences([text]).flatMap((one) => closestSentence(one, method) ?? []);
	return found.length ? [...new Set(found)].join(' ').slice(0, STEP_TEXT_MAX) : undefined;
}

/**
 * The page's sentences no step kept: what the model left out, for the review
 * to show and put back with a tap. A heading in front of a sentence ("Für die
 * Béchamelsoße: Die Zwiebel hacken.") does not make it left out.
 */
function leftOut(method: readonly string[], steps: readonly StepInput[]): LeftOut[] {
	const kept = steps.map((step) => tokens(step.text).map((token) => token.word));
	const words = (text: string) => tokens(text).map((token) => token.word);
	const omitted: LeftOut[] = [];
	// The last step a kept sentence stood in: a dropped one goes back after it,
	// so "Put back" restores the page's order (→ plan 45).
	let last = -1;
	for (const sentence of sentences(method)) {
		const plain = words(sentence);
		const bare = words(sentence.replace(/^[^.!?:]{1,60}:\s*/, ''));
		if (!plain.length) continue;
		const at = kept.findIndex(
			(step) => runAt(step, plain, 0) >= 0 || (bare.length > 0 && runAt(step, bare, 0) >= 0)
		);
		if (at >= 0) last = Math.max(last, at);
		else omitted.push({ text: sentence, after: last });
	}
	return omitted;
}

/**
 * A text as the words a person reads (→ plan 44): runs of letters and digits,
 * lowercased, a number and the unit glued to it apart ("200g" is "200" "g"),
 * with where each stands in the text. Punctuation, quotes, dashes and spacing
 * are no words, so "erhitzen.Hackfleisch" and "erhitzen. Hackfleisch" agree.
 */
export function tokens(text: string): { word: string; start: number; end: number }[] {
	const found: { word: string; start: number; end: number }[] = [];
	// A number keeps what makes it that number ("1/2", "1,5" is "1.5"), so "1-2" or
	// "1 5" for "1/2" is a changed word; a unit glued to it is a word of its own.
	for (const match of text.matchAll(/\d+(?:[.,/]\d+)*|\p{N}+|[\p{L}\p{M}]+/gu)) {
		const word = match[0].toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
		found.push({ word, start: match.index, end: match.index + match[0].length });
	}
	return found;
}

/** Which piece of a split step a link belongs to: the first that names it, else the first. */
function pieceOf(use: unknown, pieces: readonly string[]): number {
	if (pieces.length < 2 || !isRecord(use) || typeof use.phrase !== 'string') return 0;
	const at = pieces.findIndex((piece) => spansIn(piece, use.phrase as string).length > 0);
	return at < 0 ? 0 : at;
}

/** Where `needle` stands as one contiguous run in `hay`, at or after `from`; -1 when it does not. */
function runAt(hay: readonly string[], needle: readonly string[], from: number): number {
	outer: for (let at = from; at + needle.length <= hay.length; at++) {
		for (let k = 0; k < needle.length; k++) if (hay[at + k] !== needle[k]) continue outer;
		return at;
	}
	return -1;
}

/**
 * Where words stand in a step, as the step writes them: "200g" for an amount
 * phrase "200 g", "Zwiebel-Würfel" for "Zwiebel Würfel". Null when they do not.
 */
function spanIn(text: string, words: string): string | null {
	return spansIn(text, words)[0] ?? null;
}

/** Every place the words stand in a step, as the step writes them. */
function spansIn(text: string, words: string): string[] {
	const step = tokens(text);
	const hay = step.map((token) => token.word);
	const wanted = tokens(words).map((token) => token.word);
	if (!wanted.length) return [];
	const spans: string[] = [];
	for (let at = runAt(hay, wanted, 0); at >= 0; at = runAt(hay, wanted, at + 1)) {
		spans.push(text.slice(step[at].start, step[at + wanted.length - 1].end));
	}
	return spans;
}

/** A part's name, kept only where the page names it: "parts only where the page names them". */
function readSection(value: unknown, sent: string): string | null {
	const name = cleanText(value, RECIPE_SECTION_MAX);
	return name && sent.includes(normalize(name)) ? name : null;
}

/** Everything the model was sent, normalised, to check its words against. */
function sourceBlob(card: SourceRecipe | null, text: string | null): string {
	const parts = card
		? [
				card.name,
				...card.ingredientLines,
				...(card.ingredientSections ?? []),
				...card.steps,
				...(card.stepSections ?? [])
			]
		: [];
	return normalize([...parts, text ?? ''].filter(Boolean).join(' \n '));
}

function contains(where: string, word: string): boolean {
	return normalize(where).includes(normalize(word));
}

/* ── Links ────────────────────────────────────────────────────────────────── */

/**
 * The ingredients one step uses and the words that name them, each checked
 * against the step's own text (→ plan 43's model): an index has to point at a
 * row that exists; a phrase must stand in the text as whole words; an amount
 * phrase beside the phrase (the rule cook mode rewrites by), in the row's unit
 * and not more than the row. A failed phrase or amount is cleared, the link
 * stays. An exact name in the text that nobody linked is linked. The answer is
 * a list even when empty: the import's links are the step's answer.
 */
function readLinks(
	value: unknown,
	text: string,
	rows: Row[],
	finalIndex: Map<number, number>,
	known: ReadonlySet<string>
): StepLinkInput[] {
	const links: StepLinkInput[] = [];
	const seen = new Set<string>();

	for (const use of Array.isArray(value) ? value.slice(0, INGREDIENTS_MAX * 2) : []) {
		if (!isRecord(use) || typeof use.ingredient !== 'number') continue;
		if (!Number.isInteger(use.ingredient)) continue;
		const at = finalIndex.get(use.ingredient);
		if (at === undefined) continue;
		const row = rows[at];

		// A phrase stands in the step when its words do (the token view), and is
		// kept as the step writes it, so cook mode finds it character for character.
		let phrase = cleanText(use.phrase, LINK_PHRASE_MAX) || null;
		if (phrase) phrase = spanIn(text, phrase);
		if (phrase && !occurrences(text, phrase).length) phrase = null;

		// The amount as the step writes it, where it stands beside the phrase: "200g"
		// beside Zucker and "200 g" beside Mehl are two places for one answered "200 g".
		const asked = cleanText(use.amountPhrase, AMOUNT_PHRASE_MAX) || null;
		const amountPhrase =
			asked && phrase
				? (spansIn(text, asked).find((span) => amountFits(text, phrase!, span, row, known)) ?? null)
				: null;

		const key = `${at}\u0000${phrase ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);

		// A share at or past the row's total is "all of it" (as plan 22 had it).
		const share = amount(use.quantity);
		const quantity = share !== null && row.quantity !== null && share < row.quantity ? share : null;
		links.push({ ingredient: at, quantity, phrase, amountPhrase });
	}

	// The old matcher's one sure rule: an exact name in the text is that ingredient.
	rows.forEach((row, at) => {
		if (links.some((link) => link.ingredient === at)) return;
		const found = occurrences(text, row.name)[0];
		if (!found) return;
		links.push({
			ingredient: at,
			quantity: null,
			phrase: text.slice(found[0], found[1]),
			amountPhrase: null
		});
	});

	return links.sort((a, b) => a.ingredient - b.ingredient);
}

/** Whether an amount phrase stands beside its phrase and fits the row it measures. */
function amountFits(
	text: string,
	phrase: string,
	amountPhrase: string,
	row: Row,
	known: ReadonlySet<string>
): boolean {
	if (!locateAmounts(text, phrase, amountPhrase).length) return false;
	const read = readAmount(amountPhrase, known);
	if (!read) return false;
	if (read.unit === null) return row.unit === null || row.quantity === null || isCounting(row.unit);
	const mine = canonical(read.value, read.unit);
	const total = canonical(row.quantity, row.unit);
	return (
		mine !== null && total !== null && mine.key === total.key && mine.value <= total.value + 0.011
	);
}

function isCounting(unit: string): boolean {
	return !(RECIPE_UNITS as readonly string[]).includes(unit);
}

/** "200 g", "1 - 2 EL", "2": the amount the reader reads, and its unit (or none). */
export function readAmount(
	phrase: string,
	known: ReadonlySet<string> = new Set()
): { value: number; unit: string | null } | null {
	const text = phrase.trim();
	const lead = leadingAmount(text);
	if (!lead || lead.value === null) return null;
	let rest = text.slice(lead.length).trimStart();
	rest = rest.slice(rangeLength(rest)).trim();
	if (!rest) return { value: lead.value, unit: null };
	const word = rest.split(/\s+/)[0];
	if (rest.split(/\s+/).length > 1) return null;
	if (!isKnownWord(word, known)) return null;
	return { value: lead.value, unit: word };
}

/**
 * The link-level items: an ingredient the steps give more of than the recipe
 * has (`shares-exceed`), and one no step uses (`unused`, quiet).
 */
function linkChecks(rows: Row[], steps: StepInput[], known: ReadonlySet<string>): ImportCheck[] {
	const checks: ImportCheck[] = [];
	rows.forEach((row, at) => {
		const links = steps.flatMap((step) => (step.uses ?? []).filter((use) => use.ingredient === at));
		if (!links.length) {
			checks.push({ kind: 'unused', level: 'info', name: row.name, at: { ingredient: at } });
			return;
		}
		const total = canonical(row.quantity, row.unit);
		if (!total) return;
		let given = 0;
		for (const link of links) {
			const read = link.amountPhrase ? readAmount(link.amountPhrase, known) : null;
			const share = read
				? canonical(read.value, read.unit ?? row.unit)
				: link.quantity !== null
					? canonical(link.quantity, row.unit)
					: null;
			if (share && share.key === total.key) given += share.value;
		}
		if (given > total.value + 0.011) {
			checks.push({
				kind: 'shares-exceed',
				level: 'check',
				name: row.name,
				at: { ingredient: at }
			});
		}
	});
	return checks;
}

/** A timer the step's own words state, in a length cook mode can run — or none. */
function readTimer(value: unknown, text: string): StepTimer | null {
	if (!isRecord(value) || typeof value.seconds !== 'number' || !Number.isFinite(value.seconds)) {
		return null;
	}

	const seconds = Math.round(value.seconds);
	if (seconds < MIN_TIMER_SECONDS || seconds > MAX_TIMER_SECONDS) return null;
	if (!stepDurations(text).includes(seconds)) return null;

	return { seconds, label: cleanText(value.label, TIMER_LABEL_MAX) || null };
}

/** An amount worth storing: finite, positive, under the cap, two decimals. */
function amount(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
	if (value > RECIPE_QUANTITY_MAX) return null;
	return Math.round(value * 100) / 100;
}

function isRecipeUnit(value: unknown): value is string {
	return typeof value === 'string' && (RECIPE_UNITS as readonly string[]).includes(value);
}

/**
 * Control and bidi-override characters (which can make text read differently
 * from how it's stored), zero-width ones, HTML, markdown emphasis and code
 * marks, and links. A recipe needs none of them, and a page's injected
 * "visit evil.example" has nowhere to go.
 */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;
const TAGS = /<[^>]*>/g;
const LINKS = /\b(?:https?:\/\/|www\.)\S+/gi;
const MARKDOWN = /\*\*|__|`+|^#+\s+/g;
/** "- ", "• ", and with `numbering` also "1. " / "2) " — a list's furniture, not the text. */
const BULLET = /^(?:[-*•·]\s+)+/;
const NUMBERING = /^\d{1,2}[.)]\s+/;

export function cleanText(
	value: unknown,
	max: number,
	options: { numbering?: boolean } = {}
): string {
	if (typeof value !== 'string') return '';

	let text = value
		.replace(INVISIBLE, '')
		.replace(TAGS, ' ')
		.replace(LINKS, ' ')
		.replace(MARKDOWN, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(BULLET, '');

	if (options.numbering) text = text.replace(NUMBERING, '');

	return text.slice(0, max).trim();
}

/** One recipe's suggested tags and diet, as the sorting pass's AI pre-fill gives them. */
export type TagGuess = { tags: RecipeTag[]; diet: RecipeDiet | null };

/**
 * A model's tag suggestions for `count` saved recipes (→ plan 41), kept only
 * where they are real: an index that names one of the recipes asked about,
 * once; tags and a diet from the app's list. Null when the answer isn't the
 * shape asked for at all — the provider's failure, so the backup gets a turn.
 * A recipe with nothing left to suggest is simply missing from the map.
 */
export function validateTagSuggestions(raw: unknown, count: number): Map<number, TagGuess> | null {
	if (!isRecord(raw) || !Array.isArray(raw.recipes)) return null;

	const guesses = new Map<number, TagGuess>();
	for (const entry of raw.recipes.slice(0, count * 2)) {
		if (!isRecord(entry)) continue;
		const { index } = entry;
		if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= count)
			continue;
		if (guesses.has(index)) continue;

		const tags = readRecipeTags(Array.isArray(entry.tags) ? entry.tags : []);
		const diet = readRecipeDiet(entry.diet);
		if (tags.length || diet) guesses.set(index, { tags, diet });
	}
	return guesses;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
