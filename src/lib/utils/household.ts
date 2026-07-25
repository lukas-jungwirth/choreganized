/**
 * The two free-text fields a household is made of. Onboarding [5c] [5e] and
 * Settings [6a] both write them, so the limits live here rather than being
 * declared once per screen — the `maxlength` attribute and the action's guard
 * are the same number, the way `utils/shopping.ts` and `utils/tasks.ts` do it.
 */

/** Field limits, shared by the `maxlength` attribute and the action's guard. */
export const HOUSEHOLD_NAME_MAX = 60;
export const DISPLAY_NAME_MAX = 40;

/**
 * Google AI Studio (Gemini) API keys are Google API keys: `AIza…`, ~39 chars.
 * This is the one shape check the app does before storing one (the field, and
 * the Settings action, both use it) — real validation is the first extraction
 * call (→ services/ai-import.ts, plan 13).
 */
export const GEMINI_KEY_PREFIX = 'AIza';

/** A cheap "this could be a key" gate — not a validator, just a typo catcher. */
export function looksLikeGeminiKey(key: string): boolean {
	return key.startsWith(GEMINI_KEY_PREFIX) && key.length >= 20;
}
