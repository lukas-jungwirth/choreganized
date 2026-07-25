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
 * A Gemini API key is an **opaque secret we don't parse** (→ services/ai-import.ts,
 * plan 13). Google issues two formats — the legacy `AIza…` "Standard" keys and,
 * since 2026, `AQ.…` "Auth" keys (with `AIza` being retired) — so gating on a
 * prefix would reject perfectly valid keys. The only check before storing one is
 * that it's plausibly a key at all (long enough, no embedded whitespace); real
 * validation is the first extraction call, which is the sole authority on whether
 * a key works.
 */
export function looksLikeGeminiKey(key: string): boolean {
	return key.length >= 20 && !/\s/.test(key);
}
