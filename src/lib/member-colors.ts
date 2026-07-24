/**
 * The member avatar palette. These hex values are *data* — they're written to
 * `members.color` at onboarding and read back to paint avatars — so they have to
 * exist in JS as well as in CSS. They mirror the `--member-*` tokens in
 * `src/app.css`; change both together.
 */

/**
 * The `key` names the colour in `$lib/i18n` (`ui.colours`); the `value` is what
 * reaches the column. Only the value is data — "Sage" and "Salbei" are two
 * names for the same hex.
 */
export type MemberColorKey = 'sage' | 'terracotta' | 'blue' | 'amber' | 'plum';

export type MemberColor = { key: MemberColorKey; value: string };

export const MEMBER_COLORS: MemberColor[] = [
	{ key: 'sage', value: '#5F8D72' },
	{ key: 'terracotta', value: '#C67C51' },
	{ key: 'blue', value: '#5C7FA3' },
	{ key: 'amber', value: '#D69B4A' },
	{ key: 'plum', value: '#9A6B8F' }
];

export function isMemberColor(value: string): boolean {
	return MEMBER_COLORS.some((color) => color.value === value);
}

/** First colour nobody in the household has taken, for sensible pre-selection. */
export function firstFreeColor(taken: string[]): string {
	return (MEMBER_COLORS.find((color) => !taken.includes(color.value)) ?? MEMBER_COLORS[0]).value;
}
