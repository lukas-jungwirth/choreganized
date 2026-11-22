/**
 * What a tag, a diet or an active filter is called, in the reader's language
 * (→ plan 40). `utils/` keeps the values; the catalog keeps the words; this is
 * the one place that looks one up in the other, so the form, the recipe view,
 * the library row and the filter sheet all say the same thing.
 */
import type { Messages } from '$lib/i18n';
import type { FilterAtom } from '$lib/utils/recipe-filter';
import { splitTag, type RecipeDiet, type RecipeTag } from '$lib/utils/recipe-tags';
import type { MealSlot } from '$lib/utils/meals';
import type { RecipeFreeFrom, RecipeKind } from '$lib/utils/recipe-tags';

export function tagName(tag: RecipeTag, m: Messages): string {
	const [group, value] = splitTag(tag);
	if (group === 'meal') return m.cooking.slots[value as MealSlot];
	if (group === 'kind') return m.cooking.tags.kinds[value as RecipeKind];
	return m.cooking.tags.freeFrom[value as RecipeFreeFrom];
}

export function dietName(diet: RecipeDiet, m: Messages): string {
	return m.cooking.tags.diets[diet];
}

export function atomName(atom: FilterAtom, m: Messages): string {
	switch (atom.group) {
		case 'favourites':
			return m.cooking.filters.favourites;
		case 'max':
			return m.cooking.filters.under(atom.value);
		case 'meals':
			return m.cooking.slots[atom.value];
		case 'kinds':
			return m.cooking.tags.kinds[atom.value];
		case 'diets':
			return m.cooking.tags.diets[atom.value];
		case 'free':
			return m.cooking.tags.freeFrom[atom.value];
	}
}
