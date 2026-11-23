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
import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lte,
	max,
	or,
	sql
} from 'drizzle-orm';
import type { CalendarDate } from '$lib/utils/dates';
import { parseIngredient, RECIPE_QUANTITY_MAX } from '$lib/utils/ingredients';
import { readRecipeTags, type RecipeDiet, type RecipeTag } from '$lib/utils/recipe-tags';
import {
	AMOUNT_PHRASE_MAX,
	cleanText,
	INGREDIENTS_MAX,
	INGREDIENT_LINE_MAX,
	INGREDIENT_NOTE_MAX,
	LINK_PHRASE_MAX,
	RECIPE_SECTION_MAX,
	RECIPE_NAME_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEPS_MAX,
	STEP_TEXT_MAX,
	type RecipeInput,
	type StepInput,
	type StepTimer
} from '$lib/utils/recipes';
import type { StepUse } from '$lib/utils/step-highlight';
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS, TIMER_LABEL_MAX } from '$lib/utils/timer-parse';
import { db } from '../db';
import {
	meals,
	members,
	recipeIngredients,
	recipeStepIngredients,
	recipeSteps,
	recipeTags,
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
	/** Meal, kind and free-from, in list order (→ plan 40, `utils/recipe-tags`). */
	tags: RecipeTag[];
	/** Null = nobody said yet. */
	diet: RecipeDiet | null;
	/** The heart [7a]. */
	favourite: boolean;
	/**
	 * The last day up to today it was on the plan — "Not cooked lately"
	 * (→ plan 40). Null when it never was, or when the caller didn't ask
	 * (`ListOptions.today`).
	 */
	lastPlanned: CalendarDate | null;
};

export type RecipeIngredientRow = {
	id: string;
	/** What you buy (→ DECISIONS #314). */
	name: string;
	quantity: number | null;
	unit: string | null;
	/** Everything else the line said, shown under the name, never on the list (→ plan 43). */
	note: string | null;
	/** The part of the dish ("Béchamel"), or null (→ DECISIONS #312). */
	section: string | null;
};

export type RecipeStepRow = {
	id: string;
	text: string;
	/** The part of the dish the step belongs to, or null (→ plan 43). */
	section: string | null;
	/**
	 * The ingredients pinned to this step, or null for one that reads its own
	 * text (→ `$lib/utils/step-highlight`). An empty array is a real answer:
	 * "this step uses nothing", said by hand. A pin may carry the words that
	 * name it and its amount (→ plan 43, `$lib/utils/step-links`), and one
	 * ingredient may be pinned twice under two phrases.
	 */
	uses: StepUse[] | null;
	/** The step's own timer (→ plan 21), or null for one that reads its text. */
	timer: StepTimer | null;
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
	createdAt: recipes.createdAt,
	diet: recipes.diet,
	favourite: recipes.favourite
};

export type ListOptions = {
	/**
	 * Case-insensitive substring of the name **or of an ingredient's name** —
	 * the library's search field, so "lemon" finds the salmon (→ plan 40).
	 */
	search?: string | null;
	limit?: number;
	/**
	 * Household-local today. Given, each summary carries `lastPlanned` — the
	 * library's "Not cooked lately" — counting days up to and including today;
	 * a dinner planned for Thursday hasn't been cooked yet.
	 */
	today?: CalendarDate;
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
		.where(and(eq(recipes.householdId, householdId), search ? searchMatches(search) : undefined))
		// `id` breaks ties for a bulk insert (the seed writes both recipes in the
		// same millisecond), so the order never flickers between renders.
		.orderBy(desc(recipes.createdAt), desc(recipes.id))
		// SQLite reads a negative LIMIT as "no limit" — the unlimited case.
		.limit(options.limit ?? -1)
		.all();

	const stocked = idsWithIngredients(householdId);
	const tags = tagsByRecipe(householdId);
	const planned = options.today ? lastPlannedByRecipe(householdId, options.today) : new Map();

	return rows.map((row) =>
		toSummary(row, stocked.has(row.id), tags.get(row.id) ?? [], planned.get(row.id) ?? null)
	);
}

/**
 * Every tag in the household, by recipe — one query for the whole library,
 * in list order (→ `readRecipeTags`), so the recipe view lists meals before
 * kinds however they were ticked.
 */
function tagsByRecipe(householdId: string, recipeId?: string): Map<string, RecipeTag[]> {
	const rows = db
		.select({ recipeId: recipeTags.recipeId, tag: recipeTags.tag })
		.from(recipeTags)
		.innerJoin(recipes, eq(recipeTags.recipeId, recipes.id))
		.where(
			and(eq(recipes.householdId, householdId), recipeId ? eq(recipes.id, recipeId) : undefined)
		)
		.all();

	const raw = new Map<string, string[]>();
	for (const row of rows) {
		const list = raw.get(row.recipeId);
		if (list) list.push(row.tag);
		else raw.set(row.recipeId, [row.tag]);
	}

	return new Map([...raw].map(([id, list]) => [id, readRecipeTags(list)]));
}

/**
 * The last day up to `today` each recipe was on this household's plan
 * (→ plan 40, "Not cooked lately"). Planned is close enough to cooked: the
 * plan is the record the app has, and it is never pruned. A meal whose recipe
 * was deleted points at nothing and so counts for nothing.
 */
function lastPlannedByRecipe(householdId: string, today: CalendarDate): Map<string, CalendarDate> {
	const rows = db
		.select({ recipeId: meals.recipeId, last: max(meals.date) })
		.from(meals)
		.where(
			and(eq(meals.householdId, householdId), isNotNull(meals.recipeId), lte(meals.date, today))
		)
		.groupBy(meals.recipeId)
		.all();

	return new Map(
		rows.flatMap((row) => (row.recipeId && row.last ? [[row.recipeId, row.last]] : []))
	);
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
function searchMatches(search: string) {
	const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	// A plain subquery rather than a correlated `exists`, for the reason
	// `idsWithIngredients` gives: Drizzle doesn't qualify the column names of a
	// hand-written correlated one. The outer query is household-scoped, so the
	// inner one needn't be.
	const byIngredient = db
		.select({ id: recipeIngredients.recipeId })
		.from(recipeIngredients)
		.where(sql`${recipeIngredients.name} like ${pattern} escape '\\'`);

	return or(sql`${recipes.name} like ${pattern} escape '\\'`, inArray(recipes.id, byIngredient));
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

/**
 * Throw away an import's temp photo the person replaced or removed — only if
 * it **is** one (→ `claimImportedPhoto`). The path came back from the form, so
 * a forged one naming an attached recipe photo must delete nothing.
 */
export function discardImportedPhoto(imagePath: string): void {
	const temp = claimImportedPhoto(imagePath);
	if (temp) deleteUpload(temp);
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
		...toSummary(
			row,
			ingredients.length > 0,
			tagsByRecipe(householdId, recipeId).get(recipeId) ?? [],
			null
		),
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
			unit: recipeIngredients.unit,
			note: recipeIngredients.note,
			section: recipeIngredients.section
		})
		.from(recipeIngredients)
		.where(eq(recipeIngredients.recipeId, recipeId))
		.orderBy(asc(recipeIngredients.sortOrder), asc(recipeIngredients.id))
		.all();
}

function listSteps(recipeId: string): RecipeStepRow[] {
	const steps = db
		.select({
			id: recipeSteps.id,
			text: recipeSteps.text,
			set: recipeSteps.ingredientsSet,
			timerSeconds: recipeSteps.timerSeconds,
			timerLabel: recipeSteps.timerLabel,
			section: recipeSteps.section
		})
		.from(recipeSteps)
		.where(eq(recipeSteps.recipeId, recipeId))
		.orderBy(asc(recipeSteps.sortOrder), asc(recipeSteps.id))
		.all();

	const pinned = pinsByStep(steps.filter((step) => step.set).map((step) => step.id));

	return steps.map((step) => ({
		id: step.id,
		text: step.text,
		section: step.section,
		// The flag decides, not the count: a step whose list is empty on purpose
		// must not fall back to reading its own text (→ DECISIONS #127).
		uses: step.set ? (pinned.get(step.id) ?? []) : null,
		timer: step.timerSeconds ? { seconds: step.timerSeconds, label: step.timerLabel } : null
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
			quantity: recipeStepIngredients.quantity,
			phrase: recipeStepIngredients.phrase,
			amountPhrase: recipeStepIngredients.amountPhrase
		})
		.from(recipeStepIngredients)
		.where(inArray(recipeStepIngredients.stepId, stepIds))
		.orderBy(asc(recipeStepIngredients.sortOrder), asc(recipeStepIngredients.id))
		.all();

	for (const row of rows) {
		const use: StepUse = {
			ingredientId: row.ingredientId,
			quantity: row.quantity,
			phrase: row.phrase,
			amountPhrase: row.amountPhrase
		};
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
		diet: RecipeDiet | null;
		favourite: boolean;
	},
	hasIngredients: boolean,
	tags: RecipeTag[],
	lastPlanned: CalendarDate | null
): RecipeSummary {
	return {
		id: row.id,
		name: row.name,
		imagePath: row.imagePath,
		timeMinutes: row.timeMinutes,
		servings: row.servings,
		createdAt: row.createdAt.getTime(),
		hasIngredients,
		tags,
		diet: row.diet,
		favourite: row.favourite,
		lastPlanned
	};
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
				// What it is travels with it; the heart doesn't — the copy is
				// a draft to change, not the recipe the household loves.
				diet: source.diet,
				createdByMemberId: memberId
			})
			.returning({ id: recipes.id })
			.get();

		writeTags(tx, copy.id, source.tags);

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
							note: ingredient.note,
							section: ingredient.section,
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
							pins.push({
								stepId: id,
								ingredientId,
								quantity: use.quantity,
								phrase: use.phrase ?? null,
								amountPhrase: use.amountPhrase ?? null,
								sortOrder: pinned++
							});
						});

						return {
							id,
							recipeId: copy.id,
							text: step.text,
							ingredientsSet: step.uses !== null,
							timerSeconds: step.timer?.seconds ?? null,
							timerLabel: step.timer?.label ?? null,
							section: step.section,
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
		servings: normalizeCount(input.servings, RECIPE_SERVINGS_MAX),
		// Absent = the caller has no opinion (an older importer): leave it be.
		...(input.diet === undefined ? {} : { diet: input.diet })
	};
}

/**
 * The recipe's tags, replaced: unknown keys dropped rather than refused, so a
 * stale form still saves (→ `readRecipeTags`).
 */
function writeTags(tx: Transaction, recipeId: string, tags: readonly string[]): void {
	tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId)).run();

	const rows = readRecipeTags(tags).map((tag) => ({ recipeId, tag }));
	if (rows.length) tx.insert(recipeTags).values(rows).run();
}

/**
 * A recipe nobody has tagged yet — no tag and no diet — as the sorting pass
 * shows it (→ plan 41): enough to recognise it and to guess its diet from.
 */
export type UntaggedRecipe = {
	id: string;
	name: string;
	imagePath: string | null;
	timeMinutes: number | null;
	/** Ingredient names in recipe order — the diet guess and the AI read these. */
	ingredients: string[];
};

/** This household's untagged recipes, newest first like the library. */
export function listUntaggedRecipes(householdId: string): UntaggedRecipe[] {
	const tagged = new Set(tagsByRecipe(householdId).keys());

	const rows = db
		.select({
			id: recipes.id,
			name: recipes.name,
			imagePath: recipes.imagePath,
			timeMinutes: recipes.timeMinutes
		})
		.from(recipes)
		.where(and(eq(recipes.householdId, householdId), isNull(recipes.diet)))
		.orderBy(desc(recipes.createdAt), desc(recipes.id))
		.all()
		.filter((row) => !tagged.has(row.id));

	if (!rows.length) return [];

	const names = db
		.select({ recipeId: recipeIngredients.recipeId, name: recipeIngredients.name })
		.from(recipeIngredients)
		.where(
			inArray(
				recipeIngredients.recipeId,
				rows.map((row) => row.id)
			)
		)
		.orderBy(asc(recipeIngredients.sortOrder), asc(recipeIngredients.id))
		.all();

	const byRecipe = new Map<string, string[]>();
	for (const row of names) {
		const list = byRecipe.get(row.recipeId);
		if (list) list.push(row.name);
		else byRecipe.set(row.recipeId, [row.name]);
	}

	return rows.map((row) => ({ ...row, ingredients: byRecipe.get(row.id) ?? [] }));
}

/**
 * Just the tags and diet of one recipe — the sorting pass's Next (→ plan 41).
 * `onlyUntagged` leaves a recipe alone that has gained a tag or a diet since
 * the card was shown (a housemate sorting at the same time): their word stands.
 * `'gone'` when the recipe isn't this household's.
 */
export function setRecipeTags(
	householdId: string,
	recipeId: string,
	tags: readonly string[],
	diet: RecipeDiet | null,
	options: { onlyUntagged?: boolean } = {}
): 'saved' | 'kept' | 'gone' {
	return db.transaction((tx) => {
		const recipe = tx
			.select({ diet: recipes.diet })
			.from(recipes)
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.get();
		if (!recipe) return 'gone';

		if (options.onlyUntagged) {
			const tagged = tx
				.select({ tag: recipeTags.tag })
				.from(recipeTags)
				.where(eq(recipeTags.recipeId, recipeId))
				.get();
			if (recipe.diet !== null || tagged) return 'kept';
		}

		tx.update(recipes)
			.set({ diet, updatedAt: new Date() })
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.run();
		writeTags(tx, recipeId, tags);
		return 'saved';
	});
}

/**
 * The heart [7a] (→ plan 40). False when the recipe isn't this household's.
 */
export function setFavourite(householdId: string, recipeId: string, favourite: boolean): boolean {
	return (
		db
			.update(recipes)
			.set({ favourite })
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.run().changes > 0
	);
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
	if (input.tags !== undefined) writeTags(tx, recipeId, input.tags);

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
		const details = input.ingredientDetails?.[posted];
		kept.set(posted, id);
		ingredients.push({
			id,
			recipeId,
			...parsed,
			name: parsed.name.slice(0, INGREDIENT_LINE_MAX),
			note: cleanText(details?.note, INGREDIENT_NOTE_MAX),
			section: cleanText(details?.section, RECIPE_SECTION_MAX),
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
		const timer = normalizeTimer(step.timer);
		steps.push({
			id,
			recipeId,
			text,
			ingredientsSet: step.uses !== null,
			timerSeconds: timer?.seconds ?? null,
			timerLabel: timer?.label ?? null,
			section: cleanText(step.section, RECIPE_SECTION_MAX),
			sortOrder: steps.length
		});
		if (step.uses) pins.push(...pinRows(id, step.uses, kept));
	}

	if (steps.length) tx.insert(recipeSteps).values(steps).run();
	if (pins.length) tx.insert(recipeStepIngredients).values(pins).run();
}

/**
 * A step's timer as stored: whole seconds a cook-mode timer can run, and a name
 * trimmed to what the timer sheet allows — the form reader does the same, and
 * this is the write's own check, for a caller that isn't the form (an import).
 */
function normalizeTimer(timer: StepTimer | null | undefined): StepTimer | null {
	if (!timer || !Number.isFinite(timer.seconds)) return null;
	const seconds = Math.round(timer.seconds);
	if (seconds < MIN_TIMER_SECONDS || seconds > MAX_TIMER_SECONDS) return null;
	const label = timer.label?.replace(/\s+/g, ' ').trim().slice(0, TIMER_LABEL_MAX) || null;
	return { seconds, label };
}

/**
 * One step's pins as rows. A pin whose ingredient was blanked out in the same
 * save points at nothing and is dropped — the step keeps the rest of its list
 * rather than falling back to reading its text, because the rest is still what
 * the cook said. One ingredient may be pinned under two phrases (plan 43:
 * "Karotte schälen … zu den Möhren"), never twice under the same one.
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
		const phrase = cleanText(use.phrase, LINK_PHRASE_MAX);
		// The unique index would refuse a repeat anyway (and SQLite lets two NULL
		// phrases through it); this makes it a no-op rather than a lost save.
		const key = `${ingredientId}\u0000${phrase ?? ''}`;
		if (!ingredientId || seen.has(key)) continue;

		seen.add(key);
		rows.push({
			stepId,
			ingredientId,
			quantity: normalizeShare(use.quantity),
			phrase,
			amountPhrase: cleanText(use.amountPhrase, AMOUNT_PHRASE_MAX),
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
