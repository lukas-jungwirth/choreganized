/**
 * The recipe editor's state, and what it posts (→ plan 46, SPEC §4.4).
 *
 * The editor works in **parts**: a list of parts, each with a name (or none)
 * and its rows, for the ingredients and for the steps alike. That is what the
 * screen draws (a heading over each named part) and what a drag between two
 * parts moves rows across. On the way out the parts flatten back into rows,
 * each carrying its part's name as `section` (→ plan 43, DECISIONS #312), and
 * a step's links name their ingredient by its position in that flat list.
 *
 * - An ingredient is its fields (name, amount, unit, note), never a typed line;
 *   a line is only what the add field reads (`ruleRow`, plan 44's reader).
 * - A step holds its links (`EditorLink`, plan 43's columns). A step that came
 *   without any stored answer (`ingredients_set` false: an old recipe, a page's
 *   card) is **open to suggestions**, and so is one whose text was edited: the
 *   matcher's reading is offered (`suggestLinks`), and what is still offered at
 *   Save is saved as links. So an old recipe opened and saved keeps every
 *   underline it had, now stored (→ DECISIONS #324).
 *
 * Pure: the form component holds the state in runes, and the integration test
 * posts what this module would post.
 */
import { parseIngredient } from './ingredients.ts';
import type { RecipePrefill, StepTimer } from './recipes.ts';
import {
	amountFits,
	linkWord,
	suggestLinks,
	tokens,
	type EditorLink,
	type LinkTarget
} from './step-links.ts';

export type EditorIngredient = {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	note: string | null;
};

export type EditorStep = {
	id: string;
	text: string;
	links: EditorLink[];
	timer: StepTimer | null;
	/** Arrived with no stored answer: the matcher's reading is offered, and kept. */
	suggest: boolean;
	/** The text as the step was opened; an edit opens it to suggestions too. */
	opened: string;
	/** Suggested words a person turned down in this step, as written. */
	dismissed: string[];
};

export type EditorPart<T> = { id: string; name: string | null; rows: T[] };

export type EditorState = {
	ingredients: EditorPart<EditorIngredient>[];
	steps: EditorPart<EditorStep>[];
};

/** What the editor opens on besides its rows: an import's review, in full (→ plan 45). */
export type EditorOpening = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	editor: EditorState;
};

/** Keys from a counter, so the server render and the browser agree on them. */
export function keyMaker(prefix = 'k'): () => string {
	let next = 0;
	return () => `${prefix}${next++}`;
}

/** Rows with a part name each → parts: consecutive rows with one name are one part. */
export function toParts<T>(
	rows: readonly { row: T; section: string | null }[],
	key: () => string
): EditorPart<T>[] {
	const parts: EditorPart<T>[] = [];
	for (const { row, section } of rows) {
		const last = parts.at(-1);
		if (last && last.name === section) last.rows.push(row);
		else parts.push({ id: key(), name: section, rows: [row] });
	}
	return parts;
}

/** Parts → rows, each with its part's name. */
export function flatten<T>(parts: readonly EditorPart<T>[]): { row: T; section: string | null }[] {
	return parts.flatMap((part) => part.rows.map((row) => ({ row, section: part.name })));
}

/** A fresh step, empty or with text, open to suggestions. */
export function newStep(key: () => string, text = ''): EditorStep {
	return { id: key(), text, links: [], timer: null, suggest: true, opened: text, dismissed: [] };
}

/** What a saved recipe brings to the editor (the service's `RecipeDetail`, structurally). */
export type SavedRecipe = {
	ingredients: {
		id: string;
		name: string;
		quantity: number | null;
		unit: string | null;
		note: string | null;
		section: string | null;
	}[];
	steps: {
		text: string;
		section: string | null;
		uses:
			| {
					ingredientId: string;
					quantity: number | null;
					phrase?: string | null;
					amountPhrase?: string | null;
			  }[]
			| null;
		timer: StepTimer | null;
	}[];
};

/** A saved recipe, opened (→ plan 46). Nothing it stores is dropped on the way in. */
export function fromRecipe(recipe: SavedRecipe, key: () => string): EditorState {
	const byId = new Map<string, string>();
	const ingredients = toParts(
		recipe.ingredients.map((row) => {
			const id = key();
			byId.set(row.id, id);
			return {
				row: { id, name: row.name, quantity: row.quantity, unit: row.unit, note: row.note },
				section: row.section
			};
		}),
		key
	);

	const steps = toParts(
		recipe.steps.map((step) => ({
			row: {
				id: key(),
				text: step.text,
				// A link to a row that is gone (deleted on another phone between the
				// save and this load) is dropped rather than shown as a blank.
				links: (step.uses ?? []).flatMap((use) => {
					const ingredient = byId.get(use.ingredientId);
					return ingredient
						? [
								{
									ingredient,
									phrase: use.phrase ?? null,
									amountPhrase: use.amountPhrase ?? null,
									quantity: use.quantity
								}
							]
						: [];
				}),
				timer: step.timer,
				suggest: step.uses === null,
				opened: step.text,
				dismissed: []
			},
			section: step.section
		})),
		key
	);

	return { ingredients, steps: steps.length ? steps : [part(key, [newStep(key)])] };
}

/**
 * An import's draft, opened (→ plans 44, 45): each line read into its fields
 * by the same reader the save used to run, with the household's own unit
 * words; a step's links name their line by its index.
 */
export function fromPrefill(
	prefill: Pick<RecipePrefill, 'ingredientLines' | 'ingredientDetails' | 'steps'>,
	key: () => string,
	known?: ReadonlySet<string>
): EditorState {
	return openPrefill(prefill, key, known).state;
}

/**
 * `fromPrefill`, and which row and step each of the draft's indexes became:
 * the import's check items name them by index (→ plan 45). A line the reader
 * could not read has no row (null).
 */
export function openPrefill(
	prefill: Pick<RecipePrefill, 'ingredientLines' | 'ingredientDetails' | 'steps'>,
	key: () => string,
	known?: ReadonlySet<string>
): { state: EditorState; rows: (string | null)[]; steps: string[] } {
	const byIndex = new Map<number, string>();
	const rows = prefill.ingredientLines.flatMap((line, at) => {
		const parsed = parseIngredient(line, known);
		if (!parsed) return [];
		const id = key();
		byIndex.set(at, id);
		const details = prefill.ingredientDetails?.[at];
		return [
			{
				row: {
					id,
					name: parsed.name,
					quantity: parsed.quantity,
					unit: parsed.unit,
					note: details?.note ?? null
				},
				section: details?.section ?? null
			}
		];
	});

	const steps = toParts(
		prefill.steps.map((step) => ({
			row: {
				id: key(),
				text: step.text,
				links: (step.uses ?? []).flatMap((use) => {
					const ingredient = byIndex.get(use.ingredient);
					return ingredient
						? [
								{
									ingredient,
									phrase: use.phrase ?? null,
									amountPhrase: use.amountPhrase ?? null,
									quantity: use.quantity
								}
							]
						: [];
				}),
				timer: step.timer,
				suggest: step.uses === null,
				opened: step.text,
				dismissed: []
			},
			section: step.section ?? null
		})),
		key
	);

	return {
		state: {
			ingredients: toParts(rows, key),
			steps: steps.length ? steps : [part(key, [newStep(key)])]
		},
		rows: prefill.ingredientLines.map((_, at) => byIndex.get(at) ?? null),
		steps: steps.flatMap((one) => one.rows.map((row) => row.id))
	};
}

/** A new recipe: no ingredients yet, one empty step to type into. */
export function emptyState(key: () => string): EditorState {
	return { ingredients: [], steps: [part(key, [newStep(key)])] };
}

function part<T>(key: () => string, rows: T[], name: string | null = null): EditorPart<T> {
	return { id: key(), name, rows };
}

/* ── Parts ────────────────────────────────────────────────────────────────── */

/** Every part name of the recipe, ingredients' first, each once. */
export function partNames(state: EditorState): string[] {
	const names = [...state.ingredients, ...state.steps].flatMap((one) =>
		one.name ? [one.name] : []
	);
	return [...new Set(names)];
}

/**
 * Whether the recipe has parts at all. Without one the editor never says the
 * word "part" (→ plan 46): no heading, no Part row, no "Move to part…".
 */
export function hasParts(state: EditorState): boolean {
	return partNames(state).length > 0;
}

/** A new, empty part at the end of a list; a name the list already has adds nothing. */
export function addPart<T>(
	parts: readonly EditorPart<T>[],
	name: string,
	key: () => string
): EditorPart<T>[] {
	const clean = name.replace(/\s+/g, ' ').trim();
	if (!clean || parts.some((one) => one.name === clean)) return [...parts];
	return [...parts, part<T>(key, [], clean)];
}

/**
 * A part renamed. An empty name dissolves it into the part above (its rows
 * join that part's end); the first part has nothing above, so it loses its
 * name. Neighbours that end up with one name are one part.
 */
export function renamePart<T>(
	parts: readonly EditorPart<T>[],
	from: string,
	to: string
): EditorPart<T>[] {
	const clean = to.replace(/\s+/g, ' ').trim() || null;
	const out: EditorPart<T>[] = [];
	for (const one of parts) {
		const above = out.at(-1);
		if (one.name !== from) out.push(one);
		else if (clean === null && above)
			out[out.length - 1] = { ...above, rows: [...above.rows, ...one.rows] };
		else out.push({ ...one, name: clean });
	}
	return tidy(out);
}

/** Parts with consecutive equal names merged into one. */
function tidy<T>(parts: readonly EditorPart<T>[]): EditorPart<T>[] {
	const out: EditorPart<T>[] = [];
	for (const one of parts) {
		const last = out.at(-1);
		if (last && last.name === one.name) {
			out[out.length - 1] = { ...last, rows: [...last.rows, ...one.rows] };
		} else {
			out.push(one);
		}
	}
	return out;
}

/**
 * A row moved to the end of the part named `to` (null: no part). A part the
 * list doesn't have yet is made at its end; rows without a part stand above
 * every heading, so "No part" is the end of the first nameless part, made at
 * the top when there is none.
 */
export function moveToPart<T extends { id: string }>(
	parts: readonly EditorPart<T>[],
	id: string,
	to: string | null,
	key: () => string
): EditorPart<T>[] {
	const row = parts.flatMap((one) => one.rows).find((one) => one.id === id);
	if (!row) return [...parts];
	const without = parts.map((one) => ({ ...one, rows: one.rows.filter((r) => r.id !== id) }));
	const at = without.findIndex((one) => one.name === to);
	if (at >= 0) {
		without[at] = { ...without[at], rows: [...without[at].rows, row] };
		return without;
	}
	return to === null ? [part(key, [row]), ...without] : [...without, part(key, [row], to)];
}

/**
 * A row one place up or down. Inside a part it swaps with its neighbour; at a
 * part's edge it crosses into the next part (the end of the one above, the
 * start of the one below). At the very top or bottom nothing moves.
 */
export function shiftRow<T extends { id: string }>(
	parts: readonly EditorPart<T>[],
	id: string,
	direction: -1 | 1
): EditorPart<T>[] {
	const out = parts.map((one) => ({ ...one, rows: [...one.rows] }));
	const p = out.findIndex((one) => one.rows.some((row) => row.id === id));
	if (p < 0) return out;
	const rows = out[p].rows;
	const r = rows.findIndex((row) => row.id === id);
	const to = r + direction;
	if (to >= 0 && to < rows.length) {
		[rows[r], rows[to]] = [rows[to], rows[r]];
		return out;
	}
	// Across the edge: into the next part that exists in that direction.
	const q = p + direction;
	if (q < 0 || q >= out.length) return out;
	const [row] = rows.splice(r, 1);
	if (direction < 0) out[q].rows.push(row);
	else out[q].rows.unshift(row);
	return out;
}

/** A row taken out of whichever part holds it. */
export function removeRow<T extends { id: string }>(
	parts: readonly EditorPart<T>[],
	id: string
): EditorPart<T>[] {
	return parts.map((one) => ({ ...one, rows: one.rows.filter((row) => row.id !== id) }));
}

/** A row replaced in place. */
export function updateRow<T extends { id: string }>(
	parts: readonly EditorPart<T>[],
	row: T
): EditorPart<T>[] {
	return parts.map((one) => ({
		...one,
		rows: one.rows.map((old) => (old.id === row.id ? row : old))
	}));
}

/* ── Links ────────────────────────────────────────────────────────────────── */

/** The ingredient rows as the link sheet offers them: named ones only. */
export function linkTargets(parts: readonly EditorPart<EditorIngredient>[]): LinkTarget[] {
	return parts.flatMap((one) =>
		one.rows.flatMap((row) =>
			row.name.trim()
				? [{ key: row.id, name: row.name.trim(), quantity: row.quantity, unit: row.unit }]
				: []
		)
	);
}

/** Whether a step's suggestions are offered: it came without links, or its text changed. */
export function suggesting(step: EditorStep): boolean {
	return step.suggest || step.text !== step.opened;
}

/** The matcher's offers for one step, each as the link accepting it would make. */
export function suggestionsFor(
	step: EditorStep,
	targets: readonly LinkTarget[],
	known?: ReadonlySet<string>
): (EditorLink & { start: number; end: number })[] {
	if (!suggesting(step)) return [];
	const all = tokens(step.text, known);
	const byKey = new Map(targets.map((row) => [row.key, row]));
	return suggestLinks(step.text, targets, step.links, step.dismissed).flatMap((one) => {
		const row = byKey.get(one.ingredient);
		return row
			? [{ ...linkWord(step.text, all, one.start, one.end, row), start: one.start, end: one.end }]
			: [];
	});
}

/**
 * A step's links as they will be saved: its own, and, for a step that came
 * without stored links, what is still suggested (→ DECISIONS #325). A step that
 * had its own answer keeps it: what an edit of its text offers waits for a tap,
 * so a link turned down in an earlier session never comes back unasked.
 */
export function savedLinks(
	step: EditorStep,
	targets: readonly LinkTarget[],
	known?: ReadonlySet<string>
): EditorLink[] {
	if (!step.suggest) return [...step.links];
	const offered = suggestionsFor(step, targets, known).map(
		({ ingredient, phrase, amountPhrase, quantity }) => ({
			ingredient,
			phrase,
			amountPhrase,
			quantity
		})
	);
	return [...step.links, ...offered];
}

/**
 * The links to one row, checked again after its amount or unit changed: a
 * share is counted in the row's unit and may not exceed it, so an amount in
 * the text gives the share it now fits as (or none), and a share without one
 * is kept only while it is still no more than the row.
 */
export function recheckLinks(
	parts: readonly EditorPart<EditorStep>[],
	row: Pick<LinkTarget, 'key' | 'quantity' | 'unit'>
): EditorPart<EditorStep>[] {
	return parts.map((one) => ({
		...one,
		rows: one.rows.map((step) => ({
			...step,
			links: step.links.map((link) => {
				if (link.ingredient !== row.key) return link;
				if (link.amountPhrase)
					return { ...link, quantity: amountFits(link.amountPhrase, row).share };
				const fits =
					link.quantity !== null && row.quantity !== null && link.quantity < row.quantity;
				return fits ? link : { ...link, quantity: null };
			})
		}))
	}));
}

/* ── The wire ─────────────────────────────────────────────────────────────── */

/**
 * Every field the form posts for its ingredients and steps, in order — the
 * hidden inputs `readRecipeForm` reads back, lined up by position. Each step
 * posts its links as a list, so a save from this editor always says what the
 * step uses (`ingredients_set`, plan 43), an empty list included.
 */
export function postedFields(state: EditorState, known?: ReadonlySet<string>): [string, string][] {
	const fields: [string, string][] = [];
	const rows = flatten(state.ingredients);
	const position = new Map(rows.map(({ row }, at) => [row.id, at]));
	const targets = linkTargets(state.ingredients);

	for (const { row, section } of rows) {
		fields.push(
			['ingredientName', row.name],
			['ingredientQuantity', row.quantity === null ? '' : String(row.quantity)],
			['ingredientUnit', row.quantity === null ? '' : (row.unit ?? '')],
			['ingredientNote', row.note ?? ''],
			['ingredientSection', section ?? '']
		);
	}

	for (const { row: step, section } of flatten(state.steps)) {
		const uses = savedLinks(step, targets, known).flatMap((link) => {
			const at = position.get(link.ingredient);
			return at === undefined
				? []
				: [
						{
							ingredient: at,
							quantity: link.quantity,
							phrase: link.phrase,
							amountPhrase: link.amountPhrase
						}
					];
		});
		fields.push(
			['step', step.text],
			['stepUses', JSON.stringify(uses)],
			['stepTimer', step.timer ? JSON.stringify(step.timer) : ''],
			['stepSection', section ?? '']
		);
	}

	return fields;
}
