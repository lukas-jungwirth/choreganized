/**
 * The bridge between a recipe and the shopping list (→ SPEC §4.8).
 *
 * A recipe is not a shopping list: half of it is already in the cupboard, and
 * the half that isn't often overlaps with what a second recipe wants this week.
 * So nothing is poured over silently any more. Both doors — the basket on a
 * recipe [7a] and the toggle on the plan sheet [3d] — end at the picker [3e],
 * which is what `buildIngredientPick` fills in and `addRecipeIngredients` acts
 * on (→ DECISIONS #123).
 *
 * The preview and the write share `planAdds` and read the list through the same
 * `listOpenItems`, so "this will make it 4 cucumbers" and what actually lands on
 * the list are the same sentence computed twice, not two rules kept in step.
 * The sheet gets the open list itself and re-runs `planAdds` on whatever is
 * *ticked*, which is the only way a preview can stay true while somebody is
 * still deciding.
 */
import { scaleIngredients, servingsFactor } from '$lib/utils/ingredients';
import { itemName, planAdds, suggestionKey, type NamedAmount } from '$lib/utils/shopping';
import { listStapleKeys, rememberStaples } from './pantry';
import { getRecipe, type RecipeDetail } from './recipes';
import { addIngredients, listOpenItems, type IngredientAddResult } from './shopping';

/** One line of the picker: the ingredient, and how it opens. */
export type IngredientPickRow = {
	/** `recipe_ingredients.id` — what the sheet ticks and posts back. */
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	/** The household keeps leaving this off, so it opens unticked (→ `pantry`). */
	staple: boolean;
	/** Ticked when the sheet opens. */
	selected: boolean;
};

export type IngredientPick = {
	recipeId: string;
	/** The sheet's title — the recipe these came from. */
	recipeName: string;
	/**
	 * How many the amounts below are written for, or null when the recipe never
	 * said. The sheet scales off this and hides its stepper without it — half of
	 * an unknown is unknown (→ SPEC §4.5).
	 */
	writtenFor: number | null;
	rows: IngredientPickRow[];
	/**
	 * The open shopping rows this recipe can actually land on, in walking order —
	 * the sheet re-runs `planAdds` against them on every tick, so each row's
	 * "becomes 4" is about the rows actually chosen rather than about the whole
	 * recipe. The alternative is a round trip per tap.
	 *
	 * Filtered to names the recipe mentions, because `planAdds` matches by name
	 * and can never find the rest: shipping the household's whole list with every
	 * recipe view would be paying for forty rows to answer a question about two.
	 */
	open: (NamedAmount & { id: string })[];
};

/**
 * The picker's contents, or null when there is no sheet to show — the recipe
 * belongs to another household, has been deleted, or has no ingredients in it.
 */
export function buildIngredientPick(householdId: string, recipeId: string): IngredientPick | null {
	const recipe = getRecipe(householdId, recipeId);
	return recipe ? pickFor(householdId, recipe) : null;
}

/**
 * The same, for a caller that has already read the recipe — the recipe screen's
 * load, which would otherwise pay for its name and its ingredients twice.
 */
export function pickFor(householdId: string, recipe: RecipeDetail): IngredientPick | null {
	if (!recipe.ingredients.length) return null;

	const wanted = new Set(recipe.ingredients.map((ingredient) => suggestionKey(ingredient.name)));
	const open = listOpenItems(householdId).filter((item) => wanted.has(suggestionKey(item.name)));

	const plan = planAdds(open, recipe.ingredients);
	const staples = listStapleKeys(householdId);

	const rows = recipe.ingredients.map((ingredient, index) => {
		const staple = staples.has(suggestionKey(ingredient.name));

		return {
			id: ingredient.id,
			name: ingredient.name,
			quantity: ingredient.quantity,
			unit: ingredient.unit,
			staple,
			// Everything that would change the list, minus what the cupboard
			// already holds. Something already on the list opens unticked too:
			// ticking it would do nothing, and a count that promises four items
			// and moves two is worse than no count.
			selected: plan.rows[index].effect !== 'have' && !staple
		};
	});

	return {
		recipeId: recipe.id,
		recipeName: recipe.name,
		writtenFor: recipe.servings,
		rows,
		open
	};
}

export type IngredientPickSubmission = {
	recipeId: string;
	/** The rows that were ticked. */
	chosen: string[];
	/**
	 * The rows the sheet opened *with* ticked. An untick only means "we have
	 * that at home" measured against this — a row left alone because it was
	 * already on the list says nothing about the cupboard (→ `services/pantry`).
	 */
	offered: string[];
	/**
	 * How many people this is being cooked for, if the sheet's stepper was
	 * moved. Null cooks the recipe as written (→ SPEC §4.5).
	 */
	cookingFor: number | null;
};

/**
 * What the picker submits: the chosen ingredients onto the list, and one
 * lesson about the ones that were declined. Null when the recipe isn't this
 * household's — which a deleted recipe and a forged id answer identically.
 */
export function addRecipeIngredients(
	householdId: string,
	memberId: string,
	submission: IngredientPickSubmission
): IngredientAddResult | null {
	const recipe = getRecipe(householdId, submission.recipeId);
	if (!recipe) return null;

	const chosen = new Set(submission.chosen);
	const offered = new Set(submission.offered);

	// Six people need more grams of the same pasta, so the amounts are scaled
	// and the names are not — which is why the cupboard below still learns from
	// the unscaled list (→ `utils/ingredients` `scaleIngredients`).
	const wanted = scaleIngredients(
		recipe.ingredients.filter((ingredient) => chosen.has(ingredient.id)),
		servingsFactor(recipe.servings, submission.cookingFor ?? recipe.servings ?? 0)
	);

	// What the add is about to do, worked out before anything is written. It is
	// pure and cannot fail, which is what lets the cupboard be taught *first*:
	// the two writes are separate transactions, and of the two orders this is
	// the one whose retry is harmless. The other way round, an add that
	// committed before a failing `rememberStaples` would merge a second time on
	// the retry and quietly double every amount.
	// Keyed on the names the list will actually store, so this pass and the write
	// below can't disagree about a name the column would truncate (→ `itemName`).
	const effects = planAdds(
		listOpenItems(householdId),
		wanted.map((ingredient) => ({ ...ingredient, name: itemName(ingredient.name) }))
	).rows;

	rememberStaples(householdId, {
		// Only what actually reaches the list: ticking something that was already
		// on it moves nothing, and must not be read as "we've run out".
		bought: wanted
			.filter((_, index) => effects[index].effect !== 'have')
			.map((ingredient) => ingredient.name),
		left: recipe.ingredients
			.filter((ingredient) => offered.has(ingredient.id) && !chosen.has(ingredient.id))
			.map((ingredient) => ingredient.name)
	});

	// No `storeId`: ingredients land where quick-add sends things, the topmost
	// store (→ SPEC §4.2 "each to the default store").
	return addIngredients(householdId, memberId, wanted);
}
