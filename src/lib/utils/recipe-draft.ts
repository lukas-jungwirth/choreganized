/**
 * A model's recipe → a draft the editor may open on, or a refusal (→ plan 22,
 * SPEC §4.7, DECISIONS #148).
 *
 * **The gate.** The provider was asked for a strict JSON shape, and structured
 * output usually delivers it — but "usually" is not a property to store data
 * on, and the content inside a valid shape is still a model's: an amount of
 * 10⁹, a pin to ingredient 37 of 5, a timer the step never mentions, a step that
 * is a link. Everything here assumes the answer is hostile and keeps only what
 * passes, row by row, rather than throwing the whole answer away for one bad
 * field:
 *
 * 1. **Shape** — not an object at all is the one outright refusal (the provider's
 *    fault, so the backup gets a turn). A wrong-typed row is dropped, and the
 *    pins are re-pointed to where the surviving rows ended up.
 * 2. **Strings** — control and bidi characters, HTML, markdown, URLs and leading
 *    numbering out; whitespace collapsed; every field capped by the limits the
 *    form itself enforces.
 * 3. **Numbers** — finite, positive, under the caps; a unit outside the app's
 *    list is no unit.
 * 4. **Pins** — an ingredient index has to point at a row that exists; a
 *    step's share can't exceed the row's total; an empty list means "read the
 *    text", not "uses nothing" (#127 — only a person says that).
 * 5. **Timers** — only where the step's own text states that duration
 *    (`stepDurations`). A timer the text doesn't name is a timer the model
 *    invented.
 * 6. **Fidelity** — improving a page's own recipe card without instructions
 *    must keep its rows: the same number of ingredients and steps, and the
 *    card's name, servings and time. Anything else is a rewrite nobody asked
 *    for, and the card is used as written instead.
 *
 * Then Save checks everything again (`readRecipeForm`, the service's clamps):
 * this gate keeps bad data out of the editor, that one out of the database.
 *
 * Pure — no `$lib`, no server — so the whole policy is unit-tested
 * (→ `recipe-draft.test.ts`).
 */
import { formatIngredient, RECIPE_QUANTITY_MAX, RECIPE_UNITS } from './ingredients';
import {
	clampCount,
	INGREDIENT_LINE_MAX,
	INGREDIENT_NAME_MAX,
	INGREDIENTS_MAX,
	RECIPE_NAME_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEP_TEXT_MAX,
	STEPS_MAX,
	type RecipePrefill,
	type StepInput,
	type StepTimer
} from './recipes';
import type { UnitLabels } from './shopping';
import {
	MAX_TIMER_SECONDS,
	MIN_TIMER_SECONDS,
	stepDurations,
	TIMER_LABEL_MAX
} from './timer-parse';

/** A page's own recipe card, as the improvement was asked to keep it. */
export type SourceRecipe = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	ingredientLines: string[];
	steps: string[];
};

export type DraftContext = {
	/** The card an "improve" call started from; absent when the model extracted from scratch. */
	source?: SourceRecipe | null;
	/** Whether the household asked for changes — then the rows may legitimately differ. */
	instructed: boolean;
	/** The unit spellings ingredient lines are written back in ("EL", not "tbsp"). */
	labels?: UnitLabels;
};

export type DraftCheck =
	| { ok: true; draft: Omit<RecipePrefill, 'photo'>; dropped: number }
	| {
			ok: false;
			/**
			 * `shape` — not the object asked for (the provider's failure);
			 * `empty` — nothing recipe-like in it (the input's);
			 * `fidelity` — an improvement that rewrote the card.
			 */
			reason: 'shape' | 'empty' | 'fidelity';
	  };

export function validateRecipeDraft(raw: unknown, context: DraftContext): DraftCheck {
	if (!isRecord(raw)) return { ok: false, reason: 'shape' };

	let dropped = 0;

	// ── Ingredients ──
	type Row = { quantity: number | null; unit: string | null; name: string };
	const rows: Row[] = [];
	/** Where each answered row ended up after drops — what the pins are re-pointed by. */
	const moved = new Map<number, number>();

	(Array.isArray(raw.ingredients) ? raw.ingredients : []).forEach((item: unknown, at) => {
		const name = isRecord(item) ? cleanText(item.name, INGREDIENT_NAME_MAX) : '';
		if (!isRecord(item) || !name || rows.length >= INGREDIENTS_MAX) {
			dropped++;
			return;
		}

		const quantity = amount(item.quantity);
		// A unit measures a quantity (the parser's rule): no number, no unit.
		const unit = quantity !== null && isRecipeUnit(item.unit) ? item.unit : null;

		moved.set(at, rows.length);
		rows.push({ quantity, unit, name });
	});

	// ── Steps ──
	const steps: StepInput[] = [];

	for (const item of Array.isArray(raw.steps) ? raw.steps : []) {
		const text = isRecord(item)
			? cleanText(item.text, STEP_TEXT_MAX, { numbering: true })
			: cleanText(item, STEP_TEXT_MAX, { numbering: true });
		if (!text || steps.length >= STEPS_MAX) {
			dropped++;
			continue;
		}

		steps.push({
			text,
			uses: isRecord(item) ? readUses(item.uses, moved, rows) : null,
			timer: isRecord(item) ? readTimer(item.timer, text) : null
		});
	}

	let name = cleanText(raw.name, RECIPE_NAME_MAX);
	let timeMinutes = clampCount(raw.timeMinutes, RECIPE_TIME_MAX);
	let servings = clampCount(raw.servings, RECIPE_SERVINGS_MAX);

	if (!name && !rows.length && !steps.length) return { ok: false, reason: 'empty' };

	// ── Fidelity ──
	const source = context.source;
	if (source && !context.instructed) {
		const sameRows =
			rows.length === Math.min(source.ingredientLines.length, INGREDIENTS_MAX) &&
			steps.length === Math.min(source.steps.length, STEPS_MAX);
		if (!sameRows) return { ok: false, reason: 'fidelity' };

		// The card's own facts stand; the model only structured the rows.
		name = source.name.slice(0, RECIPE_NAME_MAX) || name;
		timeMinutes = clampCount(source.timeMinutes, RECIPE_TIME_MAX) ?? timeMinutes;
		servings = clampCount(source.servings, RECIPE_SERVINGS_MAX) ?? servings;
	}

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
			steps
		}
	};
}

/**
 * The ingredients one step uses, re-pointed past dropped rows. A share is kept
 * only where it is a real part of a row with an amount — "all of it" (equal to
 * the total, or no share given) is stored as `null`, like a plain tick. An
 * empty or unreadable list is `null`: the step reads its own text, and only a
 * person gets to say "this step uses nothing" (→ DECISIONS #127).
 */
function readUses(
	value: unknown,
	moved: Map<number, number>,
	rows: { quantity: number | null }[]
): StepInput['uses'] {
	if (!Array.isArray(value)) return null;

	const uses: NonNullable<StepInput['uses']> = [];
	const seen = new Set<number>();

	for (const use of value.slice(0, INGREDIENTS_MAX)) {
		if (!isRecord(use) || typeof use.ingredient !== 'number') continue;
		if (!Number.isInteger(use.ingredient)) continue;

		const row = moved.get(use.ingredient);
		if (row === undefined || seen.has(row)) continue;
		seen.add(row);

		// A share at or past the row's total is "all of it" — an over-share can only
		// be a misreading, and the whole row is the safe one.
		const total = rows[row].quantity;
		const share = amount(use.quantity);
		const quantity = share !== null && total !== null && share < total ? share : null;

		uses.push({ ingredient: row, quantity });
	}

	return uses.length ? uses : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
