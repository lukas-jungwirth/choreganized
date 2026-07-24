/**
 * The two actions the plan sheet [3d] posts to, shared by the two pages that
 * raise it — the week [04] and a recipe's "Add to plan" [7a].
 *
 * Actions normally live in their route, and these would too if only one screen
 * planned a meal. Two screens, one sheet: keeping a copy per route meant the
 * same sheet could answer differently depending on where it was opened from,
 * with nothing to catch the drift. Spread into each route's `actions` instead
 * (→ docs/ARCHITECTURE.md "Server patterns" — still thin, still one service
 * call each).
 */
import { fail, type Actions, type RequestEvent } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { isCalendarDate } from '$lib/utils/dates';
import { readPlanForm } from '$lib/utils/recipes';
import { requireMember } from './guards';
import { planMeal, removeMeal } from './services/meals';

export const mealPlanActions = {
	/** Plan (or replace) a day's dinner. */
	plan: async (event: RequestEvent) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const m = catalog(event.locals.locale);

		const input = readPlanForm(form, m);
		if ('error' in input) return fail(400, { error: input.error });

		const { planned, shopping } = planMeal(householdId, member.id, input);
		// Nothing was written — the sheet must stay up and say so rather than
		// closing on a meal that doesn't exist.
		if (!planned) {
			return fail(409, { error: m.errors.recipes.gonePickAnother });
		}

		return { planned, shopping };
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
