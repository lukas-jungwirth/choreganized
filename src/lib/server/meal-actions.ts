/**
 * The three actions the cooking sheets post to, shared by the two pages that
 * raise them — the week [04] and a recipe's "Add to plan" [7a].
 *
 * Actions normally live in their route, and these would too if only one screen
 * planned a meal. Two screens, one sheet: keeping a copy per route meant the
 * same sheet could answer differently depending on where it was opened from,
 * with nothing to catch the drift. Spread into each route's `actions` instead
 * (→ docs/ARCHITECTURE.md "Server patterns" — still thin, still one service
 * call each). `addToList` joined them when the ingredient picker [3e] became a
 * step of its own: it is raised from both pages too, and from two doors on one
 * of them.
 */
import { fail, type Actions, type RequestEvent } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { isCalendarDate } from '$lib/utils/dates';
import { readPlanForm, readServings } from '$lib/utils/recipes';
import { requireMember } from './guards';
import { planMeal, removeMeal } from './services/meals';
import { addRecipeIngredients } from './services/recipe-shopping';

export const mealPlanActions = {
	/** Plan (or replace) a day's dinner. */
	plan: async (event: RequestEvent) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const m = catalog(event.locals.locale);

		const input = readPlanForm(form, m);
		if ('error' in input) return fail(400, { error: input.error });

		const { planned, pick } = planMeal(householdId, member.id, input);
		// Nothing was written — the sheet must stay up and say so rather than
		// closing on a meal that doesn't exist.
		if (!planned) {
			return fail(409, { error: m.errors.recipes.gonePickAnother });
		}

		return { planned, pick };
	},

	/**
	 * What the ingredient picker [3e] submits: the ticked ingredients onto the
	 * list. `candidateId` carries the rows the sheet *offered* ticked, which is
	 * the only way the server can tell "we have that at home" from "that was
	 * already on the list" (→ `services/pantry`).
	 */
	addToList: async (event: RequestEvent) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const shopping = addRecipeIngredients(householdId, member.id, {
			recipeId: String(form.get('recipeId') ?? ''),
			chosen: form.getAll('ingredientId').map(String),
			offered: form.getAll('candidateId').map(String),
			cookingFor: readServings(form.get('cookingFor'))
		});

		if (!shopping) {
			return fail(409, { error: catalog(event.locals.locale).errors.recipes.gone });
		}

		return { shopping };
	},

	remove: async (event: RequestEvent) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const date = form.get('date');
		if (!isCalendarDate(date)) {
			return fail(400, { error: catalog(event.locals.locale).errors.recipes.mealDay });
		}

		removeMeal(householdId, date);

		return { removed: true };
	}
} satisfies Actions;
