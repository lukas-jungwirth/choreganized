/**
 * The import's review (→ plan 45, SPEC §4.7): an imported draft as the recipe
 * it will be, with what the gate could not vouch for (plan 44's check items)
 * marked on the thing itself and settled where it stands, one tap each.
 *
 * The review works on the editor's own state (`EditorState`, plan 46): the
 * same rows, parts and links the full editor holds, so "Edit everything"
 * opens on exactly what the review shows, and Save posts what the editor
 * would (`postedFields`). A check item names its row or step by the editor's
 * key, no longer by the draft's index, so it stays on its row while rows are
 * edited, removed or put back.
 *
 * Every resolution is a pure function from one review to the next: what the
 * component calls on a tap, and what `recipe-review.test.ts` applies to a
 * draft. Untouched, an item is saved as the draft has it: the gate already
 * chose the page's amount, the page's name, the first of an either/or, and
 * left a new unit word in the note (DECISIONS #314, #328).
 *
 * The draft lives in `sessionStorage` under the import's id (`draftKey`), so a
 * reload or the app going to the background loses nothing; Save and Discard
 * drop it. Nothing reaches the server before Save but the temp photo.
 *
 * Pure, no `$lib`, relative imports with their extension (→ `recipe-editor.ts`).
 */
import {
	flatten,
	keyMaker,
	moveToPart,
	newStep,
	openPrefill,
	recheckLinks,
	removeRow,
	updateRow,
	type EditorIngredient,
	type EditorPart,
	type EditorState,
	type EditorStep
} from './recipe-editor.ts';
import type { ImportCheckKind, LeftOut, RecipePrefill } from './recipes.ts';
import { occurrences, type EditorLink } from './step-links.ts';

/** What an import hands the review: the gate's draft, the line above it, the page's site. */
export type ImportDraft = {
	prefill: RecipePrefill;
	/** "Made with AI. Check it over before saving." and what it was asked, from the server. */
	notice?: string | null;
	/** The page's host ("chefkoch.de"), for the line under the name; none for a paste or photos. */
	site?: string | null;
};

/** One check item of the gate, on the row or step it is about (by the editor's key). */
export type ReviewItem = {
	id: string;
	kind: ImportCheckKind;
	level: 'check' | 'info';
	/** The ingredient row it is about, by key; absent: a step's or the recipe's. */
	ingredient?: string;
	/** The step it is about, by key. */
	step?: string;
	/** What the page said: the line, the step's sentence, the servings text. */
	page?: string;
	/** A word the page counts in that is on no list ("Ring"). */
	word?: string;
	/** The other half of an either/or. */
	alternative?: string;
	/** The amount the model gave, where the page's stands (`amount-differs`). */
	answer?: { quantity: number | null; unit: string | null; name?: string };
	/** The row's name at import, for an item whose row is gone from the editor. */
	name?: string;
	/** Answered: by a tap, or by editing the thing it is about. */
	settled: boolean;
};

/** A sentence the import left out of the method, and where it goes back. */
export type ReviewLeftOut = {
	id: string;
	text: string;
	/** The step it follows, by key; null: before the first step. */
	after: string | null;
	/** The step it became once put back; null while it is left out. */
	back: string | null;
};

export type Review = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	editor: EditorState;
	items: ReviewItem[];
	leftOut: ReviewLeftOut[];
};

/** What one import keeps in `sessionStorage`: the draft, and the review once it is open. */
export type StoredImport = { v: 1; draft: ImportDraft; review?: Review };

/** The `sessionStorage` key of one import's draft. */
export function draftKey(id: string): string {
	return `recipe-import:${id}`;
}

/** An import's id: unguessable enough that two imports in two tabs never meet. */
export function newDraftId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Keys that cannot meet the ones already in a stored review: a page reload
 * starts a new counter, so each opening takes its own prefix.
 */
export function freshKeys(): () => string {
	return keyMaker(`${Math.random().toString(36).slice(2, 7)}-`);
}

/** A stored import read back, or null for anything that is not one (another version, a bad write). */
export function readStored(raw: string | null): StoredImport | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<StoredImport>;
		if (parsed?.v !== 1 || !parsed.draft?.prefill) return null;
		if (!Array.isArray(parsed.draft.prefill.ingredientLines)) return null;
		if (!Array.isArray(parsed.draft.prefill.steps)) return null;
		return parsed as StoredImport;
	} catch {
		return null;
	}
}

/**
 * The editor's state without its empty steps: the full editor always keeps one
 * step to type into, which is no step of the recipe in the review (and is not
 * saved either way).
 */
export function withoutEmptySteps(editor: EditorState): EditorState {
	return {
		ingredients: editor.ingredients,
		steps: editor.steps
			.map((part) => ({ ...part, rows: part.rows.filter((step) => step.text.trim()) }))
			.filter((part) => part.rows.length)
	};
}

/**
 * The draft, opened for review: the editor's state, each check item on the row
 * or step its index named (an item about a line the reader could not read has
 * nothing to stand on and goes), each left-out sentence after the step it
 * followed on the page.
 */
export function startReview(
	draft: ImportDraft,
	key: () => string,
	known?: ReadonlySet<string>
): Review {
	const { prefill } = draft;
	const opened = openPrefill(prefill, key, known);
	const editor = withoutEmptySteps(opened.state);

	const items: ReviewItem[] = (prefill.checks ?? []).flatMap((check) => {
		const at = check.at;
		const target =
			at === 'recipe'
				? {}
				: 'ingredient' in at
					? { ingredient: opened.rows[at.ingredient] ?? undefined }
					: { step: opened.steps[at.step] };
		if ('ingredient' in target && !target.ingredient) return [];
		if ('step' in target && !target.step) return [];
		return [
			{
				id: key(),
				kind: check.kind,
				level: check.level,
				...target,
				...(check.page ? { page: check.page } : {}),
				...(check.word ? { word: check.word } : {}),
				...(check.alternative ? { alternative: check.alternative } : {}),
				...(check.answer ? { answer: check.answer } : {}),
				...(check.name ? { name: check.name } : {}),
				settled: false
			}
		];
	});

	const leftOut = (prefill.leftOut ?? []).map((one: LeftOut) => ({
		id: key(),
		text: one.text,
		after:
			one.after < 0 ? null : (opened.steps[Math.min(one.after, opened.steps.length - 1)] ?? null),
		back: null
	}));

	return {
		name: prefill.name,
		timeMinutes: prefill.timeMinutes,
		servings: prefill.servings,
		editor,
		items,
		leftOut
	};
}

/* ── Reading ──────────────────────────────────────────────────────────────── */

/** A row by key, with its part's name. */
export function findIngredient(
	review: Review,
	id: string | undefined
): { row: EditorIngredient; part: string | null } | null {
	for (const part of review.editor.ingredients) {
		const row = part.rows.find((one) => one.id === id);
		if (row) return { row, part: part.name };
	}
	return null;
}

/** A step by key, with its number (counted straight through) and its part's name. */
export function findStep(
	review: Review,
	id: string | undefined
): { step: EditorStep; number: number; part: string | null } | null {
	let number = 0;
	for (const part of review.editor.steps) {
		for (const step of part.rows) {
			number += 1;
			if (step.id === id) return { step, number, part: part.name };
		}
	}
	return null;
}

/** Whether the row or step an item is about is still there. */
function stands(review: Review, item: ReviewItem): boolean {
	if (item.ingredient) return findIngredient(review, item.ingredient) !== null;
	if (item.step) return findStep(review, item.step) !== null;
	return true;
}

/**
 * The items a person is asked about and has not answered: what the banner
 * counts ("3 things to check"). An item whose row was removed is no question.
 */
export function openChecks(review: Review): ReviewItem[] {
	return review.items.filter(
		(item) => item.level === 'check' && !item.settled && stands(review, item)
	);
}

/** The items on one row, one step, or the recipe (`'recipe'`), still standing. */
export function itemsOn(
	review: Review,
	target: { ingredient: string } | { step: string } | 'recipe'
) {
	return review.items.filter((item) =>
		target === 'recipe'
			? !item.ingredient && !item.step
			: 'ingredient' in target
				? item.ingredient === target.ingredient
				: item.step === target.step
	);
}

/** The quiet items, folded at the bottom: converted amounts, ingredients no step uses. */
export function notes(review: Review): ReviewItem[] {
	return review.items.filter(
		(item) =>
			item.level === 'info' &&
			(item.kind === 'converted' || item.kind === 'unused') &&
			stands(review, item)
	);
}

/** The sentences still left out: not put back, or put back and that step removed again. */
export function stillLeftOut(review: Review): ReviewLeftOut[] {
	const texts = flatten(review.editor.steps).map(({ row }) => row.text);
	return review.leftOut.filter(
		(one) =>
			(one.back === null || !findStep(review, one.back)) &&
			// Back in the recipe another way: a reworded step that took the page's text.
			!texts.some((text) => text.includes(one.text))
	);
}

/* ── Settling ─────────────────────────────────────────────────────────────── */

function settled(review: Review, ids: (id: ReviewItem) => boolean): Review {
	return {
		...review,
		items: review.items.map((item) => (ids(item) ? { ...item, settled: true } : item))
	};
}

/** An item answered as the draft has it: keep the page's, keep the first, keep it in the note. */
export function keep(review: Review, itemId: string): Review {
	return settled(review, (item) => item.id === itemId);
}

function item(review: Review, itemId: string): ReviewItem | null {
	return review.items.find((one) => one.id === itemId) ?? null;
}

function withRow(review: Review, id: string, change: (row: EditorIngredient) => EditorIngredient) {
	const found = findIngredient(review, id);
	if (!found) return review;
	return {
		...review,
		editor: {
			...review.editor,
			ingredients: updateRow(review.editor.ingredients, change(found.row))
		}
	};
}

function withStep(review: Review, id: string, change: (step: EditorStep) => EditorStep): Review {
	return {
		...review,
		editor: {
			...review.editor,
			steps: review.editor.steps.map((part) => ({
				...part,
				rows: part.rows.map((step) => (step.id === id ? change(step) : step))
			}))
		}
	};
}

/**
 * An either/or, the other one picked (`choice`): the row is named after it,
 * and the first goes to the note in its place ("oder Hackfleisch"), so nothing
 * the page said is lost. The gate wrote "oder veganes Hack" at the front of
 * the note; that half comes out.
 */
export function chooseOther(review: Review, itemId: string): Review {
	const found = item(review, itemId);
	if (!found?.ingredient || !found.alternative) return review;
	const alternative = found.alternative;
	const next = withRow(review, found.ingredient, (row) => {
		const escaped = alternative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const said = new RegExp(`^(\\S+)\\s+${escaped}(?:,\\s*)?`, 'iu').exec(row.note ?? '');
		const joiner = said?.[1] ?? 'oder';
		const rest = said ? (row.note ?? '').slice(said[0].length).trim() : (row.note ?? '');
		return {
			...row,
			name: alternative,
			note: rest ? `${joiner} ${row.name}, ${rest}` : `${joiner} ${row.name}`
		};
	});
	return keep(next, itemId);
}

/**
 * The model's amount after all (`amount-differs`), where the page's stood. A
 * step's share of the row is checked again against it, as the editor does.
 */
export function useAnswer(review: Review, itemId: string): Review {
	const found = item(review, itemId);
	if (!found?.ingredient || !found.answer) return review;
	const { quantity, unit, name } = found.answer;
	const id = found.ingredient;
	// The model wrote its unit into the name ("Bund Suppengrün"): its amount comes with it.
	const next = withRow(review, id, (row) => ({
		...row,
		...(name ? { name } : {}),
		quantity,
		unit: quantity === null ? null : unit
	}));
	return keep(
		{
			...next,
			editor: {
				...next.editor,
				steps: recheckLinks(next.editor.steps, { key: id, quantity, unit })
			}
		},
		itemId
	);
}

/** A row taken out, and every link to it: a link to nothing is a lie on screen. */
export function removeIngredient(review: Review, id: string): Review {
	return settled(
		{
			...review,
			editor: {
				ingredients: removeRow(review.editor.ingredients, id),
				steps: review.editor.steps.map((part) => ({
					...part,
					rows: part.rows.map((step) => ({
						...step,
						links: step.links.filter((link) => link.ingredient !== id)
					}))
				}))
			}
		},
		(one) => one.ingredient === id
	);
}

/** A line the gate added from the page, removed after all (`line-added`). */
export function removeAdded(review: Review, itemId: string): Review {
	const found = item(review, itemId);
	return found?.ingredient ? removeIngredient(review, found.ingredient) : review;
}

/**
 * The step reads as the page wrote it (`reworded`). A link's words that are
 * no longer in the text are cleared and the link stays, as the gate does.
 */
export function usePageText(review: Review, itemId: string): Review {
	const found = item(review, itemId);
	if (!found?.step || !found.page) return review;
	const text = found.page;
	return keep(
		withStep(review, found.step, (step) => ({
			...step,
			text,
			opened: text,
			links: relinked(step.links, text)
		})),
		itemId
	);
}

function relinked(links: readonly EditorLink[], text: string): EditorLink[] {
	return links.map((link) =>
		link.phrase && !occurrences(text, link.phrase).length
			? { ...link, phrase: null, amountPhrase: null }
			: link
	);
}

/**
 * A new unit word taken in (`new-unit`): once the household has the word, the
 * row counts in it and the note loses it. Every other row asking about the
 * same word is answered with it.
 */
export function addUnitWord(review: Review, itemId: string, added: string): Review {
	const found = item(review, itemId);
	if (!found?.word) return review;
	const asked = found.word.toLowerCase();
	const same = review.items.filter(
		(one) =>
			one.kind === 'new-unit' &&
			one.ingredient &&
			(one.id === itemId || (!one.settled && one.word?.toLowerCase() === asked))
	);
	let next = review;
	for (const one of same) {
		const word = one.word ?? '';
		const id = one.ingredient!;
		next = withRow(next, id, (row) => {
			const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const note = (row.note ?? '').replace(new RegExp(`^${escaped}(?:,\\s*)?`, 'iu'), '').trim();
			return {
				...row,
				unit: row.quantity === null ? null : added,
				note: note || null
			};
		});
		// The row counts in a unit now: a step's share of it is read again, as the editor does.
		const row = findIngredient(next, id)?.row;
		if (row) {
			next = {
				...next,
				editor: {
					...next.editor,
					steps: recheckLinks(next.editor.steps, {
						key: id,
						quantity: row.quantity,
						unit: row.unit
					})
				}
			};
		}
	}
	return settled(next, (one) => same.some((asked) => asked.id === one.id));
}

/** How many people the recipe is for (`servings`): every amount scales from it. */
export function setServings(review: Review, servings: number | null): Review {
	return settled({ ...review, servings }, (one) => one.kind === 'servings');
}

/**
 * A left-out sentence back as a step, at its place in the page's order: after
 * the step it followed, and after any sentence put back there before it that
 * came first on the page. It joins that step's part.
 */
export function putBack(review: Review, leftOutId: string, key: () => string): Review {
	const at = review.leftOut.findIndex((one) => one.id === leftOutId);
	if (at < 0) return review;
	const sentence = review.leftOut[at];
	const step = newStep(key, sentence.text);

	// The step it goes after: its anchor, then the ones put back before it from the same anchor.
	const earlier = review.leftOut
		.slice(0, at)
		.filter((one) => one.after === sentence.after && one.back && findStep(review, one.back))
		.map((one) => one.back!);
	const anchor =
		earlier.at(-1) ?? (sentence.after && findStep(review, sentence.after) ? sentence.after : null);

	let steps: EditorPart<EditorStep>[];
	if (anchor) {
		steps = review.editor.steps.map((part) => {
			const i = part.rows.findIndex((row) => row.id === anchor);
			return i < 0
				? part
				: { ...part, rows: [...part.rows.slice(0, i + 1), step, ...part.rows.slice(i + 1)] };
		});
	} else if (sentence.after === null && review.editor.steps.length) {
		// Before the first step: at the head of the first part.
		const [first, ...rest] = review.editor.steps;
		steps = [{ ...first, rows: [step, ...first.rows] }, ...rest];
	} else if (review.editor.steps.length) {
		// The step it followed is gone: at the end.
		const last = review.editor.steps.length - 1;
		steps = review.editor.steps.map((part, i) =>
			i === last ? { ...part, rows: [...part.rows, step] } : part
		);
	} else {
		steps = [{ id: key(), name: null, rows: [step] }];
	}

	return {
		...review,
		editor: { ...review.editor, steps },
		leftOut: review.leftOut.map((one) => (one.id === leftOutId ? { ...one, back: step.id } : one))
	};
}

/* ── Editing one thing ────────────────────────────────────────────────────── */

/**
 * One ingredient edited in its sheet: its fields, and its part when the recipe
 * has parts. Whatever the import asked about the row is answered by it.
 */
export function editIngredient(
	review: Review,
	id: string,
	fields: Omit<EditorIngredient, 'id'>,
	part: string | null,
	key: () => string,
	withParts: boolean
): Review {
	const found = findIngredient(review, id);
	if (!found) return review;
	// Opened and closed without a change answers nothing: looking is not deciding.
	const same =
		fields.name === found.row.name &&
		fields.quantity === found.row.quantity &&
		fields.unit === found.row.unit &&
		fields.note === found.row.note &&
		(!withParts || part === found.part);
	if (same) return review;
	let ingredients = updateRow(review.editor.ingredients, { id, ...fields });
	if (withParts && part !== found.part) ingredients = moveToPart(ingredients, id, part, key);
	let steps = review.editor.steps;
	if (fields.quantity !== found.row.quantity || fields.unit !== found.row.unit) {
		steps = recheckLinks(steps, { key: id, ...fields });
	}
	return settled(
		{ ...review, editor: { ingredients, steps } },
		(one) => one.ingredient === id && one.level === 'check'
	);
}

/** One step's text edited: what the import asked about it is answered, its stale words cleared. */
export function editStepText(review: Review, id: string, text: string): Review {
	const clean = text.trim();
	if (!clean || clean === findStep(review, id)?.step.text) return review;
	return settled(
		withStep(review, id, (step) => ({ ...step, text: clean, links: relinked(step.links, clean) })),
		(one) => one.step === id
	);
}

/** One step's links, as the link sheet hands them back (→ plan 46). */
export function setStepLinks(
	review: Review,
	id: string,
	links: EditorLink[],
	dismissed: string[]
): Review {
	return withStep(review, id, (step) => ({ ...step, links, dismissed }));
}

/** A step removed. A sentence put back as that step is left out again. */
export function removeStep(review: Review, id: string): Review {
	return {
		...review,
		editor: {
			...review.editor,
			steps: removeRow(review.editor.steps, id).filter((part) => part.rows.length)
		}
	};
}

/** The name, time and servings as the basics sheet hands them back. */
export function editBasics(
	review: Review,
	basics: { name: string; timeMinutes: number | null; servings: number | null }
): Review {
	const next = { ...review, ...basics, name: basics.name.trim() || review.name };
	return basics.servings !== review.servings ? setServings(next, basics.servings) : next;
}

/** How many ingredients and steps the review holds, for "All 9 ingredients and 4 steps …". */
export function counts(review: Review): { ingredients: number; steps: number } {
	return {
		ingredients: flatten(review.editor.ingredients).length,
		steps: flatten(review.editor.steps).length
	};
}
