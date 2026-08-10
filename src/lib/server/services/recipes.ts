/**
 * The recipe library (→ SPEC §4.3–4.5).
 *
 * A recipe is three tables — the row, its ingredients and its steps — and the
 * app only ever edits it as a whole. So every write is one transaction that
 * **replaces** the child rows rather than diffing them: the form posts the list
 * it wants, in the order it wants, and `sortOrder` is simply the index. Diffing
 * would buy stable child ids nothing else needs and a merge conflict whenever
 * two people edit the same recipe.
 *
 * Ingredients arrive as typed lines ("400 g pasta") and are parsed here, so the
 * page, the seed and any future importer all get the same leniency
 * (→ `$lib/utils/ingredients`).
 *
 * `householdId` is in the WHERE clause of every statement, including the ones
 * that reach the children through their recipe — a forged recipe id from
 * another household finds nothing (→ docs/ARCHITECTURE.md "Server patterns").
 */
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { parseIngredient, RECIPE_QUANTITY_MAX } from '$lib/utils/ingredients';
import {
	INGREDIENTS_MAX,
	INGREDIENT_LINE_MAX,
	RECIPE_NAME_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEPS_MAX,
	STEP_TEXT_MAX,
	type RecipeInput,
	type StepInput
} from '$lib/utils/recipes';
import type { StepUse } from '$lib/utils/step-highlight';
import { db } from '../db';
import {
	meals,
	members,
	recipeIngredients,
	recipeStepIngredients,
	recipeSteps,
	recipes
} from '../db/schema';
import { copyImage, deleteUpload, readUpload, uploadContentType, uploadExists } from '../uploads';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RecipeSummary = {
	id: string;
	name: string;
	/** Path under UPLOADS_DIR; null renders the placeholder art. */
	imagePath: string | null;
	timeMinutes: number | null;
	servings: number | null;
	/** ms epoch — the library card's "added Jul 12". */
	createdAt: number;
	/** Whether "add ingredients to the list" has anything to add (→ SPEC §4.2). */
	hasIngredients: boolean;
};

export type RecipeIngredientRow = {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
};

export type RecipeStepRow = {
	id: string;
	text: string;
	/**
	 * The ingredients pinned to this step, or null for one that reads its own
	 * text (→ `$lib/utils/step-highlight`). An empty array is a real answer:
	 * "this step uses nothing", said by hand.
	 */
	uses: StepUse[] | null;
};

export type RecipeDetail = RecipeSummary & {
	ingredients: RecipeIngredientRow[];
	steps: RecipeStepRow[];
	/** Null once the housemate who added it has left ("Added by E" [7a]). */
	createdBy: { displayName: string; color: string } | null;
};

/** What the form [3c] posts — lines and text, not columns (→ `$lib/utils/recipes`). */
export type { RecipeInput };

/* ── Reading ──────────────────────────────────────────────────────────────── */

const summaryColumns = {
	id: recipes.id,
	name: recipes.name,
	imagePath: recipes.imagePath,
	timeMinutes: recipes.timeMinutes,
	servings: recipes.servings,
	createdAt: recipes.createdAt
};

export type ListOptions = {
	/** Case-insensitive substring of the name — the library's search field. */
	search?: string | null;
	limit?: number;
};

/**
 * Newest first, which is what both callers want: "Recently added" is this list
 * cut to two [04], and the library grid reads as a cookbook you keep adding to
 * [7e]. Search narrows the same list rather than reordering it by relevance —
 * a household has tens of recipes, not thousands.
 */
export function listRecipes(householdId: string, options: ListOptions = {}): RecipeSummary[] {
	const search = options.search?.trim();

	const rows = db
		.select(summaryColumns)
		.from(recipes)
		.where(and(eq(recipes.householdId, householdId), search ? nameMatches(search) : undefined))
		// `id` breaks ties for a bulk insert (the seed writes both recipes in the
		// same millisecond), so the order never flickers between renders.
		.orderBy(desc(recipes.createdAt), desc(recipes.id))
		// SQLite reads a negative LIMIT as "no limit" — the unlimited case.
		.limit(options.limit ?? -1)
		.all();

	const stocked = idsWithIngredients(householdId);

	return rows.map((row) => toSummary(row, stocked.has(row.id)));
}

/**
 * Which of the household's recipes have at least one ingredient — what decides
 * whether the plan sheet offers "add them to the shopping list" [3d].
 *
 * A second small query rather than an `exists (…)` column: Drizzle only
 * qualifies column names when the statement has a join, so a hand-written
 * correlated subquery next to a plain `select` compiles to
 * `where "recipe_id" = "id"` — both resolved against the *inner* table, which
 * is silently always false. (It was, until this was verified in the app.)
 */
function idsWithIngredients(householdId: string): Set<string> {
	const rows = db
		.selectDistinct({ recipeId: recipeIngredients.recipeId })
		.from(recipeIngredients)
		.innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
		.where(eq(recipes.householdId, householdId))
		.all();

	return new Set(rows.map((row) => row.recipeId));
}

/**
 * `LIKE` is case-insensitive for ASCII in SQLite, which is the whole of the
 * requirement. The escape clause is what stops a name containing `%` from
 * matching everything.
 */
function nameMatches(search: string) {
	const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	return sql`${recipes.name} like ${pattern} escape '\\'`;
}

/**
 * A stored photo's bytes, but only if the path is a recipe's `imagePath` **in
 * this household** — `householdId` first, like every other service function, so
 * the multi-tenancy boundary is in the signature rather than in the caller's
 * good intentions (→ CLAUDE.md "Household scoping … no exceptions, including
 * uploads"). Null covers all of: not ours, no such recipe, file gone.
 */
export async function readRecipeImage(
	householdId: string,
	imagePath: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
	const owned = db
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.householdId, householdId), eq(recipes.imagePath, imagePath)))
		.get();

	if (!owned) return null;

	const bytes = await readUpload(imagePath);
	return bytes ? { bytes, contentType: uploadContentType(imagePath) } : null;
}

/**
 * Every photo path some recipe still points at, across all households — the
 * reference set the orphan sweep subtracts (→ `uploads.ts`
 * `sweepUnreferencedRecipePhotos`, plan 12). Household-blind on purpose: it feeds
 * a filesystem sweep, not a request, and a file is kept if *any* row uses it.
 */
export function allReferencedImagePaths(): Set<string> {
	const rows = db
		.select({ imagePath: recipes.imagePath })
		.from(recipes)
		.where(isNotNull(recipes.imagePath))
		.all();

	return new Set(rows.map((row) => row.imagePath).filter((path): path is string => path !== null));
}

/**
 * Vet a photo path a recipe-import editor handed back, before attaching it to the
 * new recipe (→ plan 12). Returns the path when it is a real stored file that
 * **no recipe already owns**, else null (the recipe is then saved without a photo
 * — a non-fatal outcome, → SPEC §4.7).
 *
 * The "owned by nobody" check is the security gate, and it is deliberately *not*
 * scoped to a household: were it, a member could post another household's
 * `imagePath` and attach it to their own recipe, then read that picture through
 * the scoped image endpoint. A genuine import temp file is owned by no row —
 * nothing is persisted before Save (→ DECISIONS) — so it passes; a forged or
 * already-attached path does not. The random-UUID filename is what makes guessing
 * an in-flight temp file a non-threat for a two-person app.
 */
export function claimImportedPhoto(imagePath: string): string | null {
	if (!imagePath || !uploadExists(imagePath)) return null;

	const owned = db
		.select({ id: recipes.id })
		.from(recipes)
		.where(eq(recipes.imagePath, imagePath))
		.get();

	return owned ? null : imagePath;
}

/** The "Browse all · {n}" count [04]. */
export function countRecipes(householdId: string): number {
	const row = db
		.select({ n: count() })
		.from(recipes)
		.where(eq(recipes.householdId, householdId))
		.get();

	return row?.n ?? 0;
}

export function getRecipe(householdId: string, recipeId: string): RecipeDetail | null {
	const row = db
		.select({
			...summaryColumns,
			createdByName: members.displayName,
			createdByColor: members.color
		})
		.from(recipes)
		.leftJoin(members, eq(recipes.createdByMemberId, members.id))
		.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
		.get();

	if (!row) return null;

	const ingredients = listIngredients(recipeId);

	return {
		...toSummary(row, ingredients.length > 0),
		ingredients,
		steps: listSteps(recipeId),
		createdBy:
			row.createdByName && row.createdByColor
				? { displayName: row.createdByName, color: row.createdByColor }
				: null
	};
}

function listIngredients(recipeId: string): RecipeIngredientRow[] {
	return db
		.select({
			id: recipeIngredients.id,
			name: recipeIngredients.name,
			quantity: recipeIngredients.quantity,
			unit: recipeIngredients.unit
		})
		.from(recipeIngredients)
		.where(eq(recipeIngredients.recipeId, recipeId))
		.orderBy(asc(recipeIngredients.sortOrder), asc(recipeIngredients.id))
		.all();
}

function listSteps(recipeId: string): RecipeStepRow[] {
	const steps = db
		.select({ id: recipeSteps.id, text: recipeSteps.text, set: recipeSteps.ingredientsSet })
		.from(recipeSteps)
		.where(eq(recipeSteps.recipeId, recipeId))
		.orderBy(asc(recipeSteps.sortOrder), asc(recipeSteps.id))
		.all();

	const pinned = pinsByStep(steps.filter((step) => step.set).map((step) => step.id));

	return steps.map((step) => ({
		id: step.id,
		text: step.text,
		// The flag decides, not the count: a step whose list is empty on purpose
		// must not fall back to reading its own text (→ DECISIONS #127).
		uses: step.set ? (pinned.get(step.id) ?? []) : null
	}));
}

/** The pins of the steps that have any, in the order they were ticked. */
function pinsByStep(stepIds: string[]): Map<string, StepUse[]> {
	const byStep = new Map<string, StepUse[]>();
	if (!stepIds.length) return byStep;

	const rows = db
		.select({
			stepId: recipeStepIngredients.stepId,
			ingredientId: recipeStepIngredients.ingredientId,
			quantity: recipeStepIngredients.quantity
		})
		.from(recipeStepIngredients)
		.where(inArray(recipeStepIngredients.stepId, stepIds))
		.orderBy(asc(recipeStepIngredients.sortOrder), asc(recipeStepIngredients.id))
		.all();

	for (const row of rows) {
		const use = { ingredientId: row.ingredientId, quantity: row.quantity };
		const list = byStep.get(row.stepId);
		if (list) list.push(use);
		else byStep.set(row.stepId, [use]);
	}

	return byStep;
}

function toSummary(
	row: {
		id: string;
		name: string;
		imagePath: string | null;
		timeMinutes: number | null;
		servings: number | null;
		createdAt: Date;
	},
	hasIngredients: boolean
): RecipeSummary {
	return { ...row, createdAt: row.createdAt.getTime(), hasIngredients };
}

/* ── Writing ──────────────────────────────────────────────────────────────── */

/**
 * `imagePath` comes in already written to disk (→ `server/uploads.ts`): the
 * photo is validated, resized and stored before anything is inserted, so the
 * row is complete the first time it exists.
 */
export function createRecipe(
	householdId: string,
	memberId: string,
	input: RecipeInput,
	imagePath: string | null = null
): string {
	const fields = normalize(input);

	return db.transaction((tx) => {
		const recipe = tx
			.insert(recipes)
			.values({ householdId, ...fields, imagePath, createdByMemberId: memberId })
			.returning({ id: recipes.id })
			.get();

		writeChildren(tx, recipe.id, input);
		return recipe.id;
	});
}

/**
 * What the edit form wants done with the photo: leave it, replace it with a
 * file already on disk, or take it away.
 */
export type ImageChange = { set: string } | { clear: true } | undefined;

/**
 * The whole edit, in one transaction — text, children *and* the photo column —
 * so a recipe can't end up with new steps and its old picture. False when the
 * recipe isn't this household's; the caller then has an orphaned file to clean
 * up, which is the one thing it can't do from here.
 */
export function updateRecipe(
	householdId: string,
	recipeId: string,
	input: RecipeInput,
	image: ImageChange = undefined
): boolean {
	const previous = db.transaction((tx) => {
		const current = tx
			.select({ imagePath: recipes.imagePath })
			.from(recipes)
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.get();

		if (!current) return undefined;

		tx.update(recipes)
			.set({
				...normalize(input),
				...(image === undefined ? {} : { imagePath: 'set' in image ? image.set : null }),
				updatedAt: new Date()
			})
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.run();

		writeChildren(tx, recipeId, input);
		return current.imagePath;
	});

	if (previous === undefined) return false;

	// After the commit: a file deleted before it rolled back would be a row
	// pointing at nothing.
	if (image && previous && previous !== ('set' in image ? image.set : null)) {
		deleteUpload(previous);
	}

	return true;
}

/**
 * "Duplicate" [7c] — a working copy to change, so it takes the photo with it
 * rather than sharing the file (deleting either recipe would blank the other).
 */
export function duplicateRecipe(
	householdId: string,
	memberId: string,
	recipeId: string
): string | null {
	const source = getRecipe(householdId, recipeId);
	if (!source) return null;

	// The file first, so the row is complete the first time it exists — the same
	// order `createRecipe` takes. A copy whose insert then fails is one orphaned
	// file; a row pointing at a copy that failed would be a broken image.
	const imagePath = source.imagePath ? copyImage(source.imagePath) : null;

	return db.transaction((tx) => {
		const copy = tx
			.insert(recipes)
			.values({
				householdId,
				name: copyName(source.name),
				imagePath,
				timeMinutes: source.timeMinutes,
				servings: source.servings,
				createdByMemberId: memberId
			})
			.returning({ id: recipes.id })
			.get();

		// The copy's own ids, minted here so the steps can be pinned to *its*
		// ingredients rather than to the original's.
		const ingredientIds = new Map<string, string>();

		if (source.ingredients.length) {
			tx.insert(recipeIngredients)
				.values(
					source.ingredients.map((ingredient, sortOrder) => {
						const id = crypto.randomUUID();
						ingredientIds.set(ingredient.id, id);
						return {
							id,
							recipeId: copy.id,
							name: ingredient.name,
							quantity: ingredient.quantity,
							unit: ingredient.unit,
							sortOrder
						};
					})
				)
				.run();
		}

		if (source.steps.length) {
			const pins: (typeof recipeStepIngredients.$inferInsert)[] = [];

			tx.insert(recipeSteps)
				.values(
					source.steps.map((step, sortOrder) => {
						const id = crypto.randomUUID();
						let pinned = 0;

						step.uses?.forEach((use) => {
							const ingredientId = ingredientIds.get(use.ingredientId);
							if (!ingredientId) return;
							pins.push({ stepId: id, ingredientId, quantity: use.quantity, sortOrder: pinned++ });
						});

						return {
							id,
							recipeId: copy.id,
							text: step.text,
							ingredientsSet: step.uses !== null,
							sortOrder
						};
					})
				)
				.run();

			if (pins.length) tx.insert(recipeStepIngredients).values(pins).run();
		}

		return copy.id;
	});
}

/** "{name} (copy)", with the *name* trimmed to make room rather than the suffix. */
function copyName(name: string): string {
	const suffix = ' (copy)';
	return `${name.slice(0, RECIPE_NAME_MAX - suffix.length)}${suffix}`;
}

/**
 * Delete the recipe and everything hanging off it. Planned meals survive: the
 * FK sets their `recipeId` to NULL and the name is copied into `meals.title`
 * first, so last Thursday still says what was cooked (→ docs/DATA-MODEL.md
 * "History survives deletion").
 */
export function deleteRecipe(householdId: string, recipeId: string): boolean {
	const imagePath = db.transaction((tx) => {
		const recipe = tx
			.select({ name: recipes.name, imagePath: recipes.imagePath })
			.from(recipes)
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.get();

		if (!recipe) return undefined;

		// Refreshed here rather than trusted from planning time: the recipe may
		// have been renamed since, and the snapshot should read as the plan did.
		tx.update(meals)
			.set({ title: recipe.name })
			.where(and(eq(meals.recipeId, recipeId), eq(meals.householdId, householdId)))
			.run();

		// Ingredients and steps go with it (ON DELETE CASCADE).
		tx.delete(recipes)
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.run();

		return recipe.imagePath;
	});

	if (imagePath === undefined) return false;
	deleteUpload(imagePath);

	return true;
}

/* ── Shared normalisation ─────────────────────────────────────────────────── */

function normalize(input: RecipeInput) {
	return {
		name: input.name.trim().slice(0, RECIPE_NAME_MAX),
		timeMinutes: normalizeCount(input.timeMinutes, RECIPE_TIME_MAX),
		servings: normalizeCount(input.servings, RECIPE_SERVINGS_MAX)
	};
}

/** Whole, positive, capped — or nothing at all, which both fields allow. */
function normalizeCount(value: number | null, max: number): number | null {
	if (value === null || !Number.isFinite(value)) return null;
	const rounded = Math.round(Math.min(Math.max(value, 0), max));
	return rounded > 0 ? rounded : null;
}

/**
 * The replace half of every write: out with the old rows, in with the posted
 * ones. The pins go with their step (ON DELETE CASCADE) and are rewritten here
 * too, which is why the ids are minted in this function rather than left to the
 * column default — a pin has to name the row it was saved beside.
 */
function writeChildren(tx: Transaction, recipeId: string, input: RecipeInput): void {
	tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)).run();
	tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId)).run();

	// Parse and drop blanks *before* capping, the way the steps below do: slicing
	// the raw lines first would let five empty rows eat five real ingredients.
	// The name is capped here too — the form's `maxlength` is a courtesy, and a
	// hand-rolled POST is not obliged to honour it.
	//
	// `kept` is the posted row number of every line that survived → the id it was
	// written under, which is how a step's pins find their ingredient again after
	// blank lines and the cap have moved everything up.
	const kept = new Map<number, string>();
	const ingredients: (typeof recipeIngredients.$inferInsert)[] = [];

	input.ingredientLines.forEach((line, posted) => {
		if (ingredients.length >= INGREDIENTS_MAX) return;

		const parsed = parseIngredient(line);
		if (!parsed) return;

		const id = crypto.randomUUID();
		kept.set(posted, id);
		ingredients.push({
			id,
			recipeId,
			...parsed,
			name: parsed.name.slice(0, INGREDIENT_LINE_MAX),
			sortOrder: ingredients.length
		});
	});

	if (ingredients.length) tx.insert(recipeIngredients).values(ingredients).run();

	const steps: (typeof recipeSteps.$inferInsert)[] = [];
	const pins: (typeof recipeStepIngredients.$inferInsert)[] = [];

	for (const step of input.steps) {
		if (steps.length >= STEPS_MAX) break;

		const text = step.text.trim().slice(0, STEP_TEXT_MAX);
		if (!text) continue;

		const id = crypto.randomUUID();
		steps.push({ id, recipeId, text, ingredientsSet: step.uses !== null, sortOrder: steps.length });
		if (step.uses) pins.push(...pinRows(id, step.uses, kept));
	}

	if (steps.length) tx.insert(recipeSteps).values(steps).run();
	if (pins.length) tx.insert(recipeStepIngredients).values(pins).run();
}

/**
 * One step's pins as rows. A pin whose ingredient was blanked out in the same
 * save points at nothing and is dropped — the step keeps the rest of its list
 * rather than falling back to reading its text, because the rest is still what
 * the cook said.
 */
function pinRows(
	stepId: string,
	uses: NonNullable<StepInput['uses']>,
	kept: Map<number, string>
): (typeof recipeStepIngredients.$inferInsert)[] {
	const rows: (typeof recipeStepIngredients.$inferInsert)[] = [];
	const seen = new Set<string>();

	for (const use of uses) {
		if (rows.length >= INGREDIENTS_MAX) break;

		const ingredientId = kept.get(use.ingredient);
		// The unique index would refuse a repeat anyway; this makes it a no-op
		// rather than a lost save.
		if (!ingredientId || seen.has(ingredientId)) continue;

		seen.add(ingredientId);
		rows.push({
			stepId,
			ingredientId,
			quantity: normalizeShare(use.quantity),
			sortOrder: rows.length
		});
	}

	return rows;
}

/**
 * A step's share of an ingredient: a positive amount in that ingredient's unit,
 * or nothing at all — which reads as "all of it" and is what a plain tick
 * stores. Rounded to two decimals like every other amount, so a third of a
 * teaspoon doesn't arrive as 0.3333333333333333.
 */
function normalizeShare(quantity: number | null): number | null {
	if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) return null;
	return Math.round(Math.min(quantity, RECIPE_QUANTITY_MAX) * 100) / 100;
}
