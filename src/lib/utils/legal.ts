/**
 * The two legal pages (→ SPEC §13): their addresses, and where their back
 * chevron leads.
 *
 * They open from four places: the sign-in screen, an invite landing, a
 * guest's page (→ SPEC §11.15) and Settings → About. Each link says which with `?from=`, the way Home's album
 * card does (`/settings/raccoons?from=home`). Only the values below mean
 * anything; the back address is built here from a known shape, never copied
 * out of the query, so `?from=https://evil.example` can't make the chevron an
 * open redirect.
 */
import { ALPHABET, INVITE_CODE_LENGTH } from './invite-code';

export const LEGAL_PAGES = ['imprint', 'privacy'] as const;

export type LegalPage = (typeof LEGAL_PAGES)[number];

/** Which legal pages this deploy has — the server knows, every entrance asks. */
export type LegalLinks = Record<LegalPage, boolean>;

export function isLegalPage(value: unknown): value is LegalPage {
	return typeof value === 'string' && (LEGAL_PAGES as readonly string[]).includes(value);
}

/** Where a reader came from: a fixed screen, one invite landing, or one guest's page. */
export type LegalFrom = 'settings' | 'login' | `invite-${string}` | `guest-${string}`;

const INVITE = new RegExp(`^invite-([${ALPHABET}]{${INVITE_CODE_LENGTH}})$`);
/** A guest's link token: 32 bytes, base64url (→ services/expenses `guestPage`). */
const GUEST = /^guest-([A-Za-z0-9_-]{43})$/;

/** `?from=` read strictly: anything not on the list is no answer at all. */
export function parseLegalFrom(value: string | null | undefined): LegalFrom | null {
	if (value === 'settings' || value === 'login') return value;
	const invite = value ? INVITE.exec(value) : null;
	if (invite) return `invite-${invite[1]}`;
	const guest = value ? GUEST.exec(value) : null;
	return guest ? `guest-${guest[1]}` : null;
}

/** The `from` a guest's page links carry: back leads to that page. */
export function guestFrom(token: string): LegalFrom | null {
	return parseLegalFrom(`guest-${token}`);
}

/** The `from` an invite landing's links carry, for its stored (normalized) code. */
export function inviteFrom(code: string): LegalFrom | null {
	return parseLegalFrom(`invite-${code}`);
}

/**
 * Where back goes. With no (known) `from`, the guess is the screen that has
 * the links for this reader: Settings for a member, sign-in for anyone else
 * (a signed-in account with no household is sent on from there).
 */
export function legalBack(from: LegalFrom | null, member: boolean): string {
	if (from === 'settings') return '/settings';
	if (from === 'login') return '/login';
	if (from?.startsWith('guest-')) return `/g/${from.slice('guest-'.length)}`;
	if (from) return `/j/${from.slice('invite-'.length)}`;
	return member ? '/settings' : '/login';
}

/** A link to one page, carrying where the reader started. */
export function legalHref(page: LegalPage, from: LegalFrom | null): string {
	return from ? `/legal/${page}?from=${from}` : `/legal/${page}`;
}
