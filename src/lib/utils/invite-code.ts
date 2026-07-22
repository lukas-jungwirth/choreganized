/**
 * Household invite codes: 6 characters from a non-ambiguous alphabet (no O/0,
 * I/1, L), stored and compared uppercase without the dash, displayed as
 * `7K4-P2X` (→ docs/DATA-MODEL.md → households).
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const INVITE_CODE_LENGTH = 6;

/** Handoff cookie set by the public `/j/[code]` landing, read after sign-in. */
export const INVITE_CODE_COOKIE = 'invite_code';

export function generateInviteCode(): string {
	return Array.from(
		crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH)),
		(byte) => ALPHABET[byte % ALPHABET.length]
	).join('');
}

/**
 * Anything a human might paste ("7k4-p2x", " 7K4 P2X ") → the stored form.
 * Characters outside the alphabet are dropped, so a typo'd O or l simply
 * doesn't count towards the six — the code stays invalid instead of matching
 * something else.
 */
export function normalizeInviteCode(input: string): string {
	return input
		.toUpperCase()
		.split('')
		.filter((char) => ALPHABET.includes(char))
		.join('')
		.slice(0, INVITE_CODE_LENGTH);
}

/** Display form: `7K4P2X` → `7K4-P2X`. */
export function formatInviteCode(code: string): string {
	const half = Math.ceil(code.length / 2);
	return code.length > half ? `${code.slice(0, half)}-${code.slice(half)}` : code;
}
