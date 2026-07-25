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
import { parseIngredient } from '$lib/utils/ingredients';
import {
	INGREDIENTS_MAX,
	INGREDIENT_LINE_MAX,
	RECIPE_NAME_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEPS_MAX,
	STEP_TEXT_MAX,
	type RecipeInput
} from '$lib/utils/recipes';
import { db } from '../db';
import { meals, members, recipeIngredients, recipeSteps, recipes } from '../db/schema';
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

export type RecipeStepRow = { id: string; text: string };

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
	return db
		.select({ id: recipeSteps.id, text: recipeSteps.text })
		.from(recipeSteps)
		.where(eq(recipeSteps.recipeId, recipeId))
		.orderBy(asc(recipeSteps.sortOrder), asc(recipeSteps.id))
		.all();
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

		if (source.ingredients.length) {
			tx.insert(recipeIngredients)
				.values(
					source.ingredients.map((ingredient, sortOrder) => ({
						recipeId: copy.id,
						name: ingredient.name,
						quantity: ingredient.quantity,
						unit: ingredient.unit,
						sortOrder
					}))
				)
				.run();
		}

		if (source.steps.length) {
			tx.insert(recipeSteps)
				.values(
					source.steps.map((step, sortOrder) => ({ recipeId: copy.id, text: step.text, sortOrder }))
				)
				.run();
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

/** The replace half of every write: out with the old rows, in with the posted ones. */
function writeChildren(tx: Transaction, recipeId: string, input: RecipeInput): void {
	tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)).run();
	tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId)).run();

	// Parse and drop blanks *before* capping, the way the steps below do: slicing
	// the raw lines first would let five empty rows eat five real ingredients.
	// The name is capped here too — the form's `maxlength` is a courtesy, and a
	// hand-rolled POST is not obliged to honour it.
	const ingredients = input.ingredientLines
		.map(parseIngredient)
		.filter((parsed) => parsed !== null)
		.slice(0, INGREDIENTS_MAX)
		.map((parsed, sortOrder) => ({
			recipeId,
			...parsed,
			name: parsed.name.slice(0, INGREDIENT_LINE_MAX),
			sortOrder
		}));

	if (ingredients.length) tx.insert(recipeIngredients).values(ingredients).run();

	const steps = input.steps
		.map((text) => text.trim().slice(0, STEP_TEXT_MAX))
		.filter(Boolean)
		.slice(0, STEPS_MAX)
		.map((text, sortOrder) => ({ recipeId, text, sortOrder }));

	if (steps.length) tx.insert(recipeSteps).values(steps).run();
}
