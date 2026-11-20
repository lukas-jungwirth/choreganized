/**
 * The two free-text fields a household is made of. Onboarding [5c] [5e] and
 * Settings [6a] both write them, so the limits live here rather than being
 * declared once per screen — the `maxlength` attribute and the action's guard
 * are the same number, the way `utils/shopping.ts` and `utils/tasks.ts` do it.
 */

/** Field limits, shared by the `maxlength` attribute and the action's guard. */
export const HOUSEHOLD_NAME_MAX = 60;
/**
 * 20, not 40 (→ DECISIONS #267): Home greets you by name in 30px type beside
 * the raccoon, a column with room for about ten letters a line. A longer name
 * already saved stays until its owner next edits the profile.
 */
export const DISPLAY_NAME_MAX = 20;
