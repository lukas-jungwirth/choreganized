/**
 * The member avatar palette. These hex values are *data* — they're written to
 * `members.color` at onboarding and read back to paint avatars — so they have to
 * exist in JS as well as in CSS. They mirror the `--member-*` tokens in
 * `src/app.css`; change both together.
 */

export type MemberColor = { name: string; value: string };

export const MEMBER_COLORS: MemberColor[] = [
	{ name: 'Sage', value: '#5F8D72' },
	{ name: 'Terracotta', value: '#C67C51' },
	{ name: 'Blue', value: '#5C7FA3' },
	{ name: 'Amber', value: '#D69B4A' },
	{ name: 'Plum', value: '#9A6B8F' }
];

export function isMemberColor(value: string): boolean {
	return MEMBER_COLORS.some((color) => color.value === value);
}

/** First colour nobody in the household has taken, for sensible pre-selection. */
export function firstFreeColor(taken: string[]): string {
	return (MEMBER_COLORS.find((color) => !taken.includes(color.value)) ?? MEMBER_COLORS[0]).value;
}
