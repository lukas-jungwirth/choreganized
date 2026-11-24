/**
 * The parts of an ingredient list, read off the page's own markup when the
 * recipe card does not carry them (→ plan 44). 25 of 36 pages in the probe of
 * 2026-11-23 showed ingredient sections; Schema.org's `recipeIngredient` is a
 * flat list, so no card kept them. The page still shows them, in one of a few
 * shapes:
 *
 * - **WP Recipe Maker** (11 of 41 pages): `.wprm-recipe-ingredient-group`, each
 *   with its `.wprm-recipe-group-name` and its `li.wprm-recipe-ingredient`s.
 * - **Tasty Recipes**: `.tasty-recipes-ingredients-body`, a heading before each
 *   list but the first.
 * - **A table per part**: chefkoch.de (the heading in the table's head),
 *   gutekueche.at and servus.com (a heading just before the table), kochbar.de.
 *
 * The card's lines stay the source (the import's `source` index points at them);
 * the markup only says where each part starts. So it is used only when its rows
 * add up to exactly the card's lines and every row shares a word with the lines
 * of its part: a page whose markup says something else is read as before.
 */
import { parse, type HTMLElement, type Node } from 'node-html-parser';
import { loneSectionOff, sectionName } from './recipe-jsonld';

/** One part as the page shows it: its heading (null: none) and its rows' text. */
export type IngredientGroup = { name: string | null; rows: string[] };

/**
 * The part of each of `lines`, by index, read off the page's markup — or null
 * when no markup of a known shape agrees with the lines.
 */
export function pageIngredientSections(
	html: string | HTMLElement,
	lines: string[]
): (string | null)[] | null {
	if (lines.length === 0) return null;
	let root: HTMLElement;
	try {
		root = typeof html === 'string' ? parse(html) : html;
	} catch {
		return null;
	}

	for (const groups of [wprmGroups(root), tastyGroups(root), ...tableRuns(root, lines.length)]) {
		const sections = groups && sectionsFor(groups, lines);
		if (sections) return sections;
	}
	return null;
}

/** The groups laid over the lines, if they fit them; null if not. */
function sectionsFor(groups: IngredientGroup[], lines: string[]): (string | null)[] | null {
	const used = groups.filter((group) => group.rows.length);
	if (!used.some((group) => group.name)) return null;
	if (used.reduce((sum, group) => sum + group.rows.length, 0) !== lines.length) return null;

	const sections: (string | null)[] = [];
	let at = 0;
	for (const group of used) {
		// Rows inside a part may come in another order than the card's (gutekueche.at
		// sorts its card alphabetically), so a row is checked against its whole part.
		const words = wordsOf(lines.slice(at, at + group.rows.length).join(' '));
		// A row with no word to compare ("2") cannot disagree.
		const fits = (row: string) => {
			const own = [...wordsOf(row)];
			return own.length === 0 || own.some((word) => words.has(word));
		};
		if (!group.rows.every(fits)) return null;
		sections.push(...group.rows.map(() => group.name));
		at += group.rows.length;
	}
	const named = loneSectionOff(sections);
	return named.some(Boolean) ? named : null;
}

function wordsOf(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^\p{L}]+/u)
			.filter((word) => word.length >= 2)
	);
}

/* ── WP Recipe Maker ──────────────────────────────────────────────────────── */

function wprmGroups(root: HTMLElement): IngredientGroup[] | null {
	// A page can hold the card twice (a jump-to copy, a print copy): the first one.
	const card = root.querySelector('.wprm-recipe-ingredients-container') ?? root;
	const groups = card.querySelectorAll('.wprm-recipe-ingredient-group').map((group) => ({
		name: textName(group.querySelector('.wprm-recipe-group-name')),
		rows: group.querySelectorAll('.wprm-recipe-ingredient').map(rowText)
	}));
	return groups.length ? groups : null;
}

/* ── Tasty Recipes ────────────────────────────────────────────────────────── */

function tastyGroups(root: HTMLElement): IngredientGroup[] | null {
	const body = root.querySelector('.tasty-recipes-ingredients-body');
	if (!body) return null;

	const groups: IngredientGroup[] = [{ name: null, rows: [] }];
	for (const element of descendants(body)) {
		const tag = element.tagName?.toLowerCase() ?? '';
		if (/^h[2-6]$/.test(tag)) groups.push({ name: textName(element), rows: [] });
		else if (tag === 'li') groups[groups.length - 1].rows.push(rowText(element));
	}
	return groups;
}

/* ── A table per part ─────────────────────────────────────────────────────── */

/**
 * Every run of consecutive tables whose rows add up to the card's line count:
 * a page has other tables too (nutrition, timings), so the run is found by
 * count and then checked word by word.
 */
function tableRuns(root: HTMLElement, count: number): IngredientGroup[][] {
	const tables = root.querySelectorAll('table').map((table) => ({
		name: tableHeading(table),
		rows: table
			.querySelectorAll('tr')
			.filter((row) => row.querySelector('td') && clean(row.text))
			.map(rowText)
	}));

	const runs: IngredientGroup[][] = [];
	for (let start = 0; start < tables.length; start++) {
		let total = 0;
		for (let end = start; end < tables.length && total < count; end++) {
			total += tables[end].rows.length;
			if (total === count && end > start) runs.push(tables.slice(start, end + 1));
		}
	}
	return runs;
}

/** A table's heading: in its head or caption, else the element just before it. */
function tableHeading(table: HTMLElement): string | null {
	const inside = table.querySelector('caption, thead h2, thead h3, thead h4, thead th');
	if (inside) return textName(inside);

	let previous = table.previousElementSibling;
	// servus.com puts an empty rule between the title and the table.
	while (previous && !clean(previous.text)) previous = previous.previousElementSibling;
	if (!previous) return null;
	const tag = previous.tagName.toLowerCase();
	const titled = /title|headline|heading/i.test(previous.getAttribute('class') ?? '');
	const text = clean(previous.text);
	return (/^h[2-6]$/.test(tag) || titled) && text.length <= HEADING_MAX_CHARS
		? sectionName(text)
		: null;
}

/** Longer than this, the element before a table is prose, not its title. */
const HEADING_MAX_CHARS = 80;

/* ── Small helpers ────────────────────────────────────────────────────────── */

function textName(element: HTMLElement | null): string | null {
	return element ? sectionName(clean(element.text)) : null;
}

/** A row's words with a space between its elements: chefkoch.de's "1 Bund" and "Suppengrün" are two cells. */
function rowText(element: HTMLElement): string {
	return clean(spaced(element));
}

function spaced(node: Node): string {
	if (!(node as HTMLElement).tagName) return node.text;
	return (node.childNodes as Node[]).map(spaced).join(' ');
}

function clean(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** Every element below `element`, in document order. */
function* descendants(element: HTMLElement): Generator<HTMLElement> {
	for (const child of element.childNodes as Node[]) {
		if ((child as HTMLElement).tagName) {
			yield child as HTMLElement;
			yield* descendants(child as HTMLElement);
		}
	}
}
