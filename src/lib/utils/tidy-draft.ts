/**
 * Tidying a saved recipe (→ plan 48, SPEC §4.5): the recipe goes through the
 * import's model call and gate as if it were a page's card (`savedCard`), so
 * the gate holds the answer to it exactly as it holds an import to its page:
 * no row invented or lost, no amount changed, no step reworded.
 *
 * What the household already decided stays (`keepSaved`, DECISIONS #340):
 *
 * - **Hand-made links.** A step saved with its own answer (`ingredients_set`,
 *   `uses` not null) keeps that answer: its links are carried over to the
 *   rows that came from the same saved line, and the model's are not used.
 *   Only steps that read their own text get the model's links.
 * - **Timers.** A step's saved timer goes to the piece of it whose text states
 *   that duration (the first piece when none does), and its other pieces get
 *   none; the model's timer is used only where the saved step had none.
 * - **A step the gate kept as reworded** is matched to the saved step it shares
 *   the most words with, between its neighbours, so its links and timer are
 *   not lost to a light rewording (code review).
 *
 * Pure, so the whole policy is unit-tested (→ `tidy-draft.test.ts`).
 */
import { formatIngredient } from './ingredients';
import { linkChecks, runAt, tokens, type DraftRow } from './recipe-draft';
import type { RecipePrefill, StepInput, StepLinkInput, StepTimer } from './recipes';
import type { SourceRecipe } from './rule-draft';
import type { UnitLabels } from './shopping';
import type { StepUse } from './step-highlight';
import { occurrences } from './step-links';
import { stepDurations } from './timer-parse';

/** What a tidy reads of a saved recipe: the recipe view's own shape (`RecipeDetail`). */
export type SavedRecipe = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
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
		uses: StepUse[] | null;
		timer: StepTimer | null;
	}[];
};

/**
 * A saved recipe as a recipe card: each row as the line it reads as ("500 g
 * Hackfleisch, gemischtes", a note after a comma), its part, the steps as
 * stored. Line `i` is saved row `i`, which is how `keepSaved` finds a row's
 * links again.
 */
export function savedCard(recipe: SavedRecipe, labels?: UnitLabels): SourceRecipe {
	const hasParts = (sections: (string | null)[]) => sections.some(Boolean);
	const ingredientSections = recipe.ingredients.map((row) => row.section);
	const stepSections = recipe.steps.map((step) => step.section);
	return {
		name: recipe.name,
		timeMinutes: recipe.timeMinutes,
		servings: recipe.servings,
		ingredientLines: recipe.ingredients.map((row) => {
			const line = formatIngredient(row, labels);
			return row.note ? `${line}, ${row.note}` : line;
		}),
		...(hasParts(ingredientSections) ? { ingredientSections } : {}),
		steps: recipe.steps.map((step) => step.text),
		...(hasParts(stepSections) ? { stepSections } : {})
	};
}

/**
 * Which saved step each draft step was found in, word for word and in order,
 * as the gate finds them; -1 for one that is not the saved text (the gate has
 * flagged it `reworded`).
 */
export function stepOrigins(draft: readonly StepInput[], saved: readonly string[]): number[] {
	const starts: number[] = [];
	const hay: string[] = [];
	for (const text of saved) {
		starts.push(hay.length);
		hay.push(...tokens(text).map((token) => token.word));
	}
	let cursor = 0;
	return draft.map((step) => {
		const words = tokens(step.text).map((token) => token.word);
		const found = words.length ? runAt(hay, words, cursor) : -1;
		if (found < 0) return -1;
		cursor = found + words.length;
		return starts.findLastIndex((start) => start <= found);
	});
}

/**
 * A draft step not found word for word (the gate flagged it `reworded`) takes
 * the saved step from its found neighbours' on (theirs included: it may be a
 * piece of the same saved step) that shares the most words with it; with no
 * word in common it stays -1.
 */
export function closestOrigins(
	draft: readonly StepInput[],
	saved: readonly string[],
	found: readonly number[]
): number[] {
	const words = (text: string) => new Set(tokens(text).map((token) => token.word));
	const origins = [...found];
	origins.forEach((origin, at) => {
		if (origin >= 0) return;
		const before = Math.max(0, ...origins.slice(0, at).filter((one) => one >= 0));
		const after = origins.slice(at + 1).find((one) => one >= 0) ?? saved.length - 1;
		const mine = words(draft[at].text);
		let best = { index: -1, score: 0 };
		for (let index = before; index <= after; index++) {
			const score = [...words(saved[index])].filter((word) => mine.has(word)).length;
			if (score > best.score) best = { index, score };
		}
		origins[at] = best.index;
	});
	return origins;
}

/**
 * The gate's draft of a saved recipe, with what the household decided by hand
 * kept (see the file's head). `rows` are the gate's rows, index for index
 * with the draft's; each knows the saved line (= saved row) it came from.
 */
export function keepSaved(
	draft: Omit<RecipePrefill, 'photo'>,
	rows: readonly DraftRow[],
	recipe: SavedRecipe,
	known: ReadonlySet<string> = new Set()
): Omit<RecipePrefill, 'photo'> {
	const origins = closestOrigins(
		draft.steps,
		recipe.steps.map((step) => step.text),
		stepOrigins(
			draft.steps,
			recipe.steps.map((step) => step.text)
		)
	);
	const savedIndex = new Map(recipe.ingredients.map((row, at) => [row.id, at]));
	/** The draft rows each saved row became ("Salz und Pfeffer" may be two). */
	const became = (saved: number) => rows.flatMap((row, at) => (row.source === saved ? [at] : []));

	const steps = draft.steps.map((step, at) => {
		const origin = origins[at];
		if (origin < 0) return step;
		const saved = recipe.steps[origin];
		const pieces = origins.flatMap((one, index) => (one === origin ? [index] : []));
		const mine = (piece: (index: number) => boolean) => pieces.find(piece) ?? pieces[0];

		let timer = step.timer;
		if (saved.timer) {
			const holder = mine((index) =>
				stepDurations(draft.steps[index].text).includes(saved.timer!.seconds)
			);
			timer = holder === at ? saved.timer : null;
		}

		let uses = step.uses;
		if (saved.uses !== null) {
			uses = saved.uses.flatMap((use): StepLinkInput[] => {
				const from = savedIndex.get(use.ingredientId);
				if (from === undefined) return [];
				const phrase = use.phrase ?? null;
				const holder = phrase
					? mine((index) => occurrences(draft.steps[index].text, phrase).length > 0)
					: pieces[0];
				if (holder !== at) return [];
				// The first row the line became keeps the amount; a row split off it
				// ("Pfeffer" from "Salz und Pfeffer") is linked by the same words.
				return became(from).map((ingredient, nth) => ({
					ingredient,
					quantity: nth === 0 ? use.quantity : null,
					phrase,
					amountPhrase: nth === 0 ? (use.amountPhrase ?? null) : null
				}));
			});
		}

		return { ...step, timer, uses };
	});

	// The link items were counted on the model's links: count them again on the kept ones.
	const checks = (draft.checks ?? []).filter(
		(check) => check.kind !== 'unused' && check.kind !== 'shares-exceed'
	);
	return { ...draft, steps, checks: [...checks, ...linkChecks(rows, steps, known)] };
}
