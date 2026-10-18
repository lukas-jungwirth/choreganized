/**
 * The two free-text fields a household is made of. Onboarding [5c] [5e] and
 * Settings [6a] both write them, so the limits live here rather than being
 * declared once per screen — the `maxlength` attribute and the action's guard
 * are the same number, the way `utils/shopping.ts` and `utils/tasks.ts` do it.
 */

/** Field limits, shared by the `maxlength` attribute and the action's guard. */
export const HOUSEHOLD_NAME_MAX = 60;
export const DISPLAY_NAME_MAX = 40;
