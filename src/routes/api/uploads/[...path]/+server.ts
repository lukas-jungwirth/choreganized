/**
 * Recipe photos, served only to the household that owns them (→ SPEC §8: "no
 * cross-household data access, ever — including recipe images").
 *
 * The gate is a database lookup, not a path check: `readRecipeImage` answers
 * only when the requested path is some recipe's `imagePath` **in this member's
 * household**, so a guessed or forged filename is unreadable even to a signed-in
 * member of another household, and the filesystem layout is never part of the
 * security argument. Taking `householdId` first, like every other service call,
 * is what keeps that boundary in the type rather than in this handler.
 *
 * Everything a 404 could be — no such file, another household's file, a row
 * whose file went missing — answers the same way on purpose.
 */
import { error } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { readRecipeImage } from '$lib/server/services/recipes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { householdId } = requireMember(event);

	const image = await readRecipeImage(householdId, event.params.path);
	if (!image) error(404, catalog(event.locals.locale).errors.notFound);

	return new Response(new Uint8Array(image.bytes), {
		headers: {
			'Content-Type': image.contentType,
			'Content-Length': String(image.bytes.byteLength),
			// The filename carries a UUID and a replaced photo gets a new one, so a
			// stored file never changes content under its URL (→ server/uploads.ts).
			// `private`: this is one household's picture, not a CDN's.
			'Cache-Control': 'private, max-age=31536000, immutable'
		}
	});
};
