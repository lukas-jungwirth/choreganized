/**
 * Made-up Impressum and Datenschutz texts for the e2e server (→ SPEC §13,
 * `scripts/e2e-server.ts`), which the journeys and screenshots read back. The
 * names, places and addresses are invented; a real deploy sets its own.
 *
 * The imprint is written on one line with `\n` (two characters), the way a
 * deploy whose settings take one line would set it; the privacy text has real
 * line breaks, a heading per topic and a list.
 */
export const E2E_IMPRINT =
	'Haushaltsheld is a private project, run without profit.\\n\\nErika Musterfrau\\nMusterstraße 1\\n1234 Musterstadt\\n\\nContact: kontakt@example.com';

export const E2E_PRIVACY = `This app keeps what a household puts into it, and nothing else.

## Who is responsible
Erika Musterfrau
1234 Musterstadt
kontakt@example.com

## What is stored
- your name, email address and colour
- what your household adds: lists, chores, recipes, expenses
- recipe photos you upload

## Cookies
- session: keeps you signed in
- language and appearance: what you chose

All of them are needed to run the app.

## More
See https://example.com/datenschutz for the long version.`;
