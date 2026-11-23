/**
 * Fahrenheit in an imported step, converted by code (→ plan 44, DECISIONS
 * #323, SPEC §4.7). The household cooks in Celsius, and the import has said
 * "°F to °C" since plan 22; but the model must leave a step in the page's own
 * words (the gate checks them), so the conversion is done here, after the
 * gate, and only for imported drafts, never for a recipe somebody types.
 *
 * "350°F", "350 °F", "350° F", "350 degrees F", "350 degrees Fahrenheit" and a
 * range "350-375°F" get Celsius in front, the page's own value kept in
 * brackets: "175 °C (350 °F)", rounded to the nearest 5. A bare "350 F" is
 * left alone (it may be anything), and so is a value the page already gave in
 * °C beside it ("180°C/350°F").
 *
 * Pure, so it is unit-tested (→ `fahrenheit.test.ts`).
 */

import { STEP_TEXT_MAX, type ImportCheck } from './recipes.ts';

const NUMBER = String.raw`\d{2,3}(?:[.,]\d+)?`;

const FAHRENHEIT = new RegExp(
	String.raw`(?<![\p{L}\p{N}])(${NUMBER})(?:\s*(?:[-–]|to|or|and|bis|oder|und)\s*(${NUMBER}))?\s*(?:°\s*F(?:ahrenheit)?|degrees?\s+F(?:ahrenheit)?)(?![\p{L}])`,
	'giu'
);

/** °F → °C, to the nearest 5. */
function celsius(fahrenheit: string): number {
	const value = Number(fahrenheit.replace(',', '.'));
	return Math.round(((value - 32) * 5) / 9 / 5) * 5;
}

/**
 * An imported draft with its steps in Celsius, and a quiet `converted` item on
 * each step that changed (→ plan 44). Only imports call this.
 */
export function draftInCelsius<T extends { steps: { text: string }[]; checks?: ImportCheck[] }>(
	draft: T
): T {
	const converted: ImportCheck[] = [];
	const steps = draft.steps.map((step, at) => {
		const { text, changed } = withCelsius(step.text);
		// Past what the editor holds the °F stays: cutting the step would lose its tail,
		// and a link or timer may stand there.
		if (!changed || text.length > STEP_TEXT_MAX) return step;
		converted.push({ kind: 'converted', level: 'info', at: { step: at } });
		return { ...step, text };
	});
	if (!converted.length) return draft;
	return { ...draft, steps, checks: [...(draft.checks ?? []), ...converted] };
}

/** A step with every Fahrenheit temperature given in Celsius first; `changed` when one was. */
export function withCelsius(text: string): { text: string; changed: boolean } {
	let changed = false;
	const converted = text.replace(
		FAHRENHEIT,
		(whole: string, low: string, high: string | undefined, offset: number) => {
			const before = text.slice(Math.max(0, offset - 16), offset);
			const after = text.slice(offset + whole.length, offset + whole.length + 16);
			// Already in °C right beside it ("180°C/350°F", "180 °C (350 °F)", "350°F (175°C)"):
			// nothing to add. A °C further away is another temperature.
			if (/(?:°\s*C|celsius)\s*[/(,]?\s*$/i.test(before)) return whole;
			if (/^\s*[/(,]?\s*\d{2,3}(?:[.,]\d+)?\s*(?:°\s*C|degrees?\s+c(?:elsius)?)/i.test(after)) {
				return whole;
			}
			changed = true;
			const value = high ? `${celsius(low)}–${celsius(high)}` : `${celsius(low)}`;
			return `${value} °C (${whole})`;
		}
	);
	return { text: converted, changed };
}
