/**
 * A recipe's ingredients as the shopping list receives them (→ plan 43, SPEC
 * §4.8, DECISIONS #313). One pure function, run by the picker [3e] on every
 * tap and by the server on submit, so the sheet promises exactly what the
 * write does.
 *
 * - **Names only.** The note ("in Scheiben geschnitten") never reaches the
 *   list; `name` is what you buy (→ DECISIONS #314).
 * - **Units the list can shop for.** A container counting word ("1 Dose Mais")
 *   becomes a pack with its number. Every other counting word ("2 Zehen", "1
 *   Prise"), and tbsp and tsp, put the name on the list with no amount: nobody
 *   buys two cloves or a tablespoon.
 * - **One row per name.** "Butter" in the Bolognese and in the Béchamel is one
 *   line, its amounts added by the merge rules the list itself uses
 *   (`planAdds`), and the parts it came from named beside it.
 */
import { countingWord, isContainerWord, unitFromWord } from './amounts';
import { itemName, planAdds, suggestionKey, type Amount, type NamedAmount } from './shopping';

/** An ingredient row as the recipe holds it. */
export type ShoppingSource = {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	section?: string | null;
};

/** One line the list would get. */
export type ShoppingLine = NamedAmount & {
	/** The first ingredient row's id: what the picker ticks and posts. */
	id: string;
	/** Every ingredient row gathered into this line. */
	ids: string[];
	/** The parts of the dish the rows came from, in order, each once. */
	parts: string[];
};

/** A recipe row's amount as the list can hold it (→ DECISIONS #313). */
export function shoppingAmount(quantity: number | null, unit: string | null): Amount {
	if (!unit) return { quantity, unit };

	const known = unitFromWord(unit);
	if (known === 'tbsp' || known === 'tsp') return { quantity: null, unit: null };
	if (known) return { quantity, unit };

	if (countingWord(unit)) {
		return isContainerWord(unit) && quantity !== null
			? { quantity, unit: 'pack' }
			: { quantity: null, unit: null };
	}

	// Free text from before the reader knew better: as it was.
	return { quantity, unit };
}

/**
 * The recipe's rows as list lines, in the order each name first appears.
 * Pass the rows already scaled for the number being cooked for: each row is
 * scaled on its own and the lines add them up, the order the server keeps too.
 */
export function shoppingLines(ingredients: readonly ShoppingSource[]): ShoppingLine[] {
	const groups = new Map<string, ShoppingSource[]>();

	for (const ingredient of ingredients) {
		const key = suggestionKey(itemName(ingredient.name));
		const group = groups.get(key);
		if (group) group.push(ingredient);
		else groups.set(key, [ingredient]);
	}

	return [...groups.values()].map((group) => {
		const [first] = group;
		const name = itemName(first.name);
		// The list's own merge: amounts in agreeing units add up, and one that
		// can't be added leaves the line as the first row had it.
		const merged = planAdds(
			[],
			group.map((row) => ({ name, ...shoppingAmount(row.quantity, row.unit) }))
		).inserts[0] ?? { name, quantity: null, unit: null };

		return {
			id: first.id,
			ids: group.map((row) => row.id),
			name,
			quantity: merged.quantity,
			unit: merged.quantity === null ? null : merged.unit,
			parts: [...new Set(group.flatMap((row) => (row.section ? [row.section] : [])))]
		};
	});
}
