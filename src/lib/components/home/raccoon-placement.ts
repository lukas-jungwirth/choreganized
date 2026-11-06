/**
 * Where Home's raccoon goes (→ DECISIONS #224): by its body, not its picture's
 * edge. Every pose's body — halfway between its overall buttons, worked out by
 * `npm run icons` — lands the same distance in from the right, so a slim pose
 * and one holding a racket out sit in the same place, their props reaching out
 * either side.
 *
 * Two limits move it off that spot: a prop may run into the page gutter but no
 * further, and a pose with both arms out shifts right rather than reach further
 * left than the widest pose always has, so the greeting keeps its room.
 */
/** A pose's pixel size and where its body is across it, 0–1 (`MASCOTS` has all three). */
type Art = { width: number; height: number; body: number };

/** The body's distance from the right edge, in CSS px. */
export const BODY_INSET = 76;
/** How far a prop may run past the right edge, into the gutter. */
export const MAX_BLEED = 14;
/** The furthest left a raccoon may reach, from the right edge. */
export const MAX_REACH = 163;

/** `right`: its CSS `right`; `reach`: how far left it reaches, for the greeting to clear. */
export function raccoonPlacement(art: Art, height: number): { right: number; reach: number } {
	const width = (height * art.width) / art.height;
	const atBody = BODY_INSET - (1 - art.body) * width;
	const right = Math.max(-MAX_BLEED, Math.min(atBody, MAX_REACH - width));
	return { right: Math.round(right), reach: Math.round(right + width) };
}
