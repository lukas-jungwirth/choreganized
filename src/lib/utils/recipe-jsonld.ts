/**
 * A page's Schema.org `Recipe` (JSON-LD) → the plain draft the recipe editor
 * opens on (→ SPEC §4.7, plan 12).
 *
 * Nearly every recipe site embeds a `<script type="application/ld+json">` with a
 * `Recipe` in it, because Google's rich results ask for one — Chefkoch,
 * gutekueche.at, Kitchen Stories, every WordPress recipe plugin. That one format
 * maps almost 1:1 onto our tables, so importing a recipe needs no AI and no
 * dependency: pull the script bodies, `JSON.parse` each, walk to the first
 * `Recipe`, and read its fields off.
 *
 * **Pure on purpose.** No `$lib`, no server imports, no `node:` built-ins — so
 * `node --test` can load it (→ `recipe-jsonld.test.ts`), and so the same mapping
 * runs identically wherever it's called. The caller (→ `server/recipe-import.ts`)
 * fetches the page, applies the editor's length caps and resolves the image URL;
 * everything here is string-and-JSON work on already-fetched HTML.
 *
 * Leniency is the whole game — a recipe half-read and shown in the editor beats a
 * strict parse that gives up. So a malformed block is skipped rather than thrown
 * on, an unknown shape yields an empty field rather than an error, and ingredient
 * lines are kept as raw text the editor parses the way it parses what you type.
 */

/** What one page yields — the shape the editor's prefill wants, uncapped. */
export type RecipeJsonLd = {
	name: string;
	/** Minutes, from `totalTime` (else `prepTime` + `cookTime`). */
	timeMinutes: number | null;
	servings: number | null;
	/** Raw ingredient lines ("500 g Mehl"), decoded and trimmed — the editor parses them. */
	ingredientLines: string[];
	steps: string[];
	/** The first usable image candidate, **unresolved** — the caller makes it
	 *  absolute and decides whether it's safe to fetch. */
	image: string | null;
};

/**
 * `<script type="application/ld+json">…</script>` bodies. A script element's
 * content can't contain `</script>` (the HTML tokenizer ends the element there),
 * so a lenient non-greedy match to the first closing tag is safe — no HTML
 * parser needed. `type` may carry other attributes or a charset around it, hence
 * the loose `[^>]*` on either side, and a minifier may have dropped its quotes.
 */
const LD_SCRIPT =
	/<script\b[^>]*\btype\s*=\s*(["']?)application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * The page's `Recipe`, mapped — or null. When a page describes several (a
 * teaser in the header, the real one in the article; a list of related
 * recipes), the one with the most ingredients and steps wins, the first among
 * equals; one with neither is no recipe at all, just a name and a picture.
 */
export function parseRecipeJsonLd(html: string): RecipeJsonLd | null {
	let best: RecipeJsonLd | null = null;

	for (const body of jsonLdBlocks(html)) {
		let data: unknown;
		try {
			data = JSON.parse(body);
		} catch {
			// One block with a stray comma or an unescaped quote must not sink the
			// rest of the page — the real Recipe is often in the next block.
			continue;
		}

		for (const node of ldNodes(data)) {
			if (!isType(node, 'Recipe')) continue;
			const recipe = mapRecipe(node);
			if (cardSize(recipe) > (best ? cardSize(best) : 0)) best = recipe;
		}
	}

	return best;
}

/** How much recipe a card holds: rows, not a name or a photo. Exported for the Microdata reader. */
export function cardSize(card: Pick<RecipeJsonLd, 'ingredientLines' | 'steps'>): number {
	return card.ingredientLines.length + card.steps.length;
}

function* jsonLdBlocks(html: string): Generator<string> {
	// A fresh index each call — the regex is a module-level (stateful) `g` regex.
	LD_SCRIPT.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = LD_SCRIPT.exec(html))) {
		yield stripCdata(match[2]);
	}
}

/** Some CMSs wrap the JSON in a CDATA section; JSON.parse chokes on the guard. */
function stripCdata(body: string): string {
	return body
		.replace(/^\s*<!\[CDATA\[/, '')
		.replace(/\]\]>\s*$/, '')
		.trim();
}

/**
 * Every object worth checking for a `@type`: the value itself and everything
 * nested in it — a `@graph` wrapper (Yoast and friends put the whole page's
 * nodes in one), a `WebPage`'s `mainEntity`, an `ItemList`'s items. A Recipe
 * found inside a Recipe (a related one) is weighed like any other. The depth
 * cap is for a pathological page, not a real one.
 */
function* ldNodes(data: unknown, depth = 0): Generator<Record<string, unknown>> {
	if (depth > MAX_LD_DEPTH) return;
	if (Array.isArray(data)) {
		for (const item of data) yield* ldNodes(item, depth + 1);
	} else if (isObject(data)) {
		yield data;
		for (const value of Object.values(data)) {
			if (typeof value === 'object' && value !== null) yield* ldNodes(value, depth + 1);
		}
	}
}

const MAX_LD_DEPTH = 8;

/**
 * Whether a node's `@type` names `type`. `@type` is a string or an array of them
 * ("Recipe", or `["Recipe", "NewsArticle"]`), case is not guaranteed, and some
 * sites spell the vocabulary out (`schema:Recipe`, `https://schema.org/Recipe`),
 * so the last segment is matched case-insensitively.
 */
function isType(node: Record<string, unknown>, type: string): boolean {
	const declared = node['@type'];
	const want = type.toLowerCase();
	const names = (one: unknown) =>
		typeof one === 'string' && one.split(/[/:#]/).pop()?.toLowerCase() === want;
	if (typeof declared === 'string') return names(declared);
	if (Array.isArray(declared)) return declared.some(names);
	return false;
}

function mapRecipe(node: Record<string, unknown>): RecipeJsonLd {
	return {
		name: cleanText(asString(node.name) ?? ''),
		timeMinutes: mapTime(node),
		servings: mapYield(node.recipeYield),
		// `ingredients` is the deprecated spelling some older sites still emit.
		ingredientLines: tidyIngredientLines(mapLines(node.recipeIngredient ?? node.ingredients)),
		steps: tidySteps(mapInstructions(node.recipeInstructions)),
		image: mapImage(node.image)
	};
}

/* ── Time ─────────────────────────────────────────────────────────────────── */

/**
 * ISO-8601 durations, `PnWnDTnHnMnS` — the only forms a recipe uses. Years and
 * months are meaningless for cooking time and deliberately unmatched (a string
 * carrying them falls through to null rather than mis-summing).
 */
const ISO_DURATION =
	/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

function mapTime(node: Record<string, unknown>): number | null {
	const total = isoDurationToMinutes(asString(node.totalTime));
	if (total) return total;

	// No total given: the sum of the two halves is what the header would show.
	const parts =
		(isoDurationToMinutes(asString(node.prepTime)) ?? 0) +
		(isoDurationToMinutes(asString(node.cookTime)) ?? 0);
	return parts > 0 ? parts : null;
}

/** Exported for the Microdata reader, which writes durations the same way (→ plan 22). */
export function isoDurationToMinutes(value: string | null): number | null {
	if (!value) return null;
	const match = ISO_DURATION.exec(value.trim());
	if (!match) return null;

	const [, weeks, days, hours, minutes, seconds] = match;
	// "PT1.5H" is rare but real; the sum is rounded once, at the end.
	const total = Math.round(
		toInt(weeks) * 7 * 24 * 60 +
			toInt(days) * 24 * 60 +
			Number(hours ?? 0) * 60 +
			Number(minutes ?? 0) +
			Number(seconds ?? 0) / 60
	);

	return total > 0 ? total : null;
}

/* ── Servings ─────────────────────────────────────────────────────────────── */

/**
 * `recipeYield` is a number, a string ("4 Portionen", "serves 4-6"), or an array
 * of either. Take the first digit run of whatever it is — the amount, wherever
 * the words put it.
 */
export function mapYield(value: unknown): number | null {
	const first = Array.isArray(value) ? value.find((one) => one != null) : value;

	if (typeof first === 'number')
		return Number.isFinite(first) && first > 0 ? Math.round(first) : null;
	if (typeof first === 'string') {
		const digits = /\d+/.exec(first);
		if (digits) {
			const count = Number(digits[0]);
			return count > 0 ? count : null;
		}
	}
	return null;
}

/* ── Ingredients ──────────────────────────────────────────────────────────── */

function mapLines(value: unknown): string[] {
	const list = Array.isArray(value) ? value : value != null ? [value] : [];
	return list.map((one) => cleanText(asString(one) ?? '')).filter(Boolean);
}

/* ── Steps ────────────────────────────────────────────────────────────────── */

/**
 * `recipeInstructions` comes in every shape the spec allows: one string, an array
 * of strings, an array of `HowToStep` objects, or `HowToSection`s each wrapping
 * their own `itemListElement` of steps. Flatten them all, in order, to step texts.
 */
function mapInstructions(value: unknown): string[] {
	const steps: string[] = [];
	collectSteps(value, steps);
	return steps;
}

/** Where a method written as HTML breaks into lines: `<br>`, and each block's edges. */
const BLOCK_BREAK = /<br\s*\/?>|<\/?(?:p|li|ol|ul|div|h[1-6])\b[^>]*>/gi;

/** An ingredient-list line inside a step: ends on a comma, or opens on a quantity and never closes a sentence. */
function isFragment(line: string): boolean {
	if (line.endsWith(',')) return true;
	if (/^\d+[.)]\s/.test(line) || /[.!?:;]$/.test(line)) return false;
	return /^(\d|etwas\b|eine? (prise|handvoll)\b)/i.test(line) && line.split(' ').length <= 8;
}

function collectSteps(value: unknown, into: string[]): void {
	if (value == null) return;

	if (typeof value === 'string') {
		// A single string is often the whole method with the steps on their own
		// lines — or in their own `<li>`/`<p>`, or between `<br>`s — so split so it
		// isn't one giant step. (A HowToStep's own text, by contrast, has its
		// newlines collapsed by `cleanText` and stays one step.)
		let pending = '';
		for (const part of value.replace(BLOCK_BREAK, '\n').split(/\r?\n+/)) {
			const text = cleanText(part);
			if (!text) continue;
			// A step may list its ingredients on lines of their own before the instruction;
			// those fragments belong to the step that follows, not to steps of their own.
			pending = pending ? `${pending} ${text}` : text;
			if (!isFragment(text)) {
				into.push(pending);
				pending = '';
			}
		}
		if (pending) into.push(pending);
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) collectSteps(item, into);
		return;
	}

	if (isObject(value)) {
		if (isType(value, 'HowToSection')) {
			collectSteps(value.itemListElement, into);
			return;
		}
		// `name` is a step's title ("Eier"), not its instruction — a lone word is no step.
		const name = asString(value.name);
		const text = stepText(value.text) ?? (name && /\s/.test(name.trim()) ? name : null);
		if (text) {
			const cleaned = cleanText(text);
			if (cleaned) into.push(cleaned);
			return;
		}
		// An untyped wrapper that still holds a list of steps.
		if (value.itemListElement !== undefined) collectSteps(value.itemListElement, into);
	}
}

/**
 * A `HowToStep`'s `text`. Some sites send it as an array: einfachkochen.de splits
 * every step on its commas (issue #31), so it is one instruction in pieces, not
 * several steps. Put the commas back, except after a piece that already ends a
 * sentence. (`asString` would keep only the first piece: Schritt 4 = "Eier".)
 */
function stepText(value: unknown): string | null {
	if (!Array.isArray(value)) return asString(value);
	const pieces = value
		.map((one) => asString(one)?.trim())
		.filter((one): one is string => Boolean(one));
	if (pieces.length === 0) return null;
	return pieces.reduce((text, piece) => `${text}${/[.!?:;]$/.test(text) ? ' ' : ', '}${piece}`);
}

/**
 * A card's steps as the editor wants them, whichever reader found them:
 * leftover numbering off ("1. ", "Schritt 2:"), and a heading — a short line
 * ending on a colon, "Orangensalat:" — joined to the step it heads instead of
 * standing as a step that says nothing to do. Exported for the Microdata reader.
 */
export function tidySteps(steps: string[]): string[] {
	const tidy: string[] = [];
	let heading = '';

	for (const raw of steps) {
		const text = raw.replace(STEP_NUMBER, '').trim();
		if (!text) continue;
		if (isHeading(text)) {
			heading = heading ? `${heading} ${text}` : text;
			continue;
		}
		tidy.push(heading ? `${heading} ${text}` : text);
		heading = '';
	}

	if (heading) tidy.push(heading);
	return tidy;
}

/** "1. ", "2) ", "Schritt 3:", "Step 4 –" — a list's numbering, not the instruction. */
const STEP_NUMBER = /^(?:(?:schritt|step)\s*\d{1,2}\s*[:.)–-]?\s*|\d{1,2}[.)]\s+)/i;

/** A section title: ends on a colon and is short enough to be a label, not an instruction. */
function isHeading(line: string): boolean {
	return line.endsWith(':') && line.split(/\s+/).length <= HEADING_MAX_WORDS;
}

const HEADING_MAX_WORDS = 15;

/**
 * A card's ingredient lines as rows: a section title ("Für den Teig:") is no
 * ingredient and is dropped — the rows have no groups to put it in, and on the
 * shopping list it would be a thing to buy — and a line the site split on its
 * own comma is put back together. einfachkochen.de sends "200 ml Milch (1,8 %
 * Fett)" as "200 ml Milch (1" and "8 % Fett)", the same split as #31's steps:
 * a line that opens a bracket it doesn't close takes the next line in.
 * Exported for the Microdata reader.
 */
export function tidyIngredientLines(lines: string[]): string[] {
	const tidy: string[] = [];

	for (let at = 0; at < lines.length; at++) {
		let line = lines[at];
		// Only when the next line closes it: a bracket a site simply never closed
		// must not swallow the rest of the list.
		while (unclosed(line) && at + 1 < lines.length && lines[at + 1].includes(')')) {
			const next = lines[++at];
			// A decimal comma has no space after it; a list comma does.
			line = /\d$/.test(line) && /^\d/.test(next) ? `${line},${next}` : `${line}, ${next}`;
		}
		if (line.endsWith(':') && !/^[\d½¼¾⅓⅔⅛]/.test(line)) continue;
		tidy.push(line);
	}

	return tidy;
}

function unclosed(line: string): boolean {
	return (line.match(/\(/g)?.length ?? 0) > (line.match(/\)/g)?.length ?? 0);
}

/* ── Image ────────────────────────────────────────────────────────────────── */

/**
 * `image` is a URL string, an array (take the first that resolves), or an
 * `ImageObject` carrying its URL under `url`/`contentUrl`. Returned raw — the
 * server resolves it against the page and decides whether it's safe to fetch.
 */
function mapImage(value: unknown): string | null {
	if (typeof value === 'string') return value.trim() || null;
	if (Array.isArray(value)) {
		for (const one of value) {
			const found = mapImage(one);
			if (found) return found;
		}
		return null;
	}
	if (isObject(value)) return asString(value.url) ?? asString(value.contentUrl) ?? null;
	return null;
}

/* ── Text hygiene ─────────────────────────────────────────────────────────── */

/**
 * Tags stripped, entities decoded, whitespace collapsed — what a field is
 * worth. Decoded twice: a CMS that escapes on the way in and again on the way
 * out sends "Mac &amp;amp; Cheese".
 */
function cleanText(raw: string): string {
	return decodeEntities(decodeEntities(stripTags(raw)))
		.replace(/\s+/g, ' ')
		.trim();
}

/** `<br>`, stray `<a>` and the like a site left in an instruction's `text`. */
function stripTags(raw: string): string {
	return raw.replace(/<[^>]*>/g, ' ');
}

/**
 * The named entities recipe text actually carries (`&amp;`, umlauts, fractions,
 * dashes) plus every numeric one. JSON-LD is usually already-decoded Unicode, so
 * this is for the sites that double-encode or leave HTML in a `text` field.
 */
const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	auml: 'ä',
	ouml: 'ö',
	uuml: 'ü',
	szlig: 'ß',
	eacute: 'é',
	egrave: 'è',
	agrave: 'à',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	deg: '°',
	frac12: '½',
	frac13: '⅓',
	frac14: '¼',
	frac34: '¾',
	times: '×',
	middot: '·',
	rsquo: '’',
	lsquo: '‘',
	ldquo: '“',
	rdquo: '”'
};

/** Exported for the AI fallback's page-to-text step (→ server/recipe-import.ts, plan 13). */
export function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
		if (body[0] === '#') {
			const code =
				body[1] === 'x' || body[1] === 'X'
					? parseInt(body.slice(2), 16)
					: parseInt(body.slice(1), 10);
			return Number.isFinite(code) && code > 0 ? fromCodePoint(code) : whole;
		}
		return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
	});
}

function fromCodePoint(code: number): string {
	try {
		return String.fromCodePoint(code);
	} catch {
		// Out of range (a broken entity) — drop it rather than throw.
		return '';
	}
}

/* ── Small shared helpers ─────────────────────────────────────────────────── */

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The first string a value is or contains — flattening `["4", "4 servings"]`. */
function asString(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		for (const one of value) {
			const found = asString(one);
			if (found !== null) return found;
		}
	}
	return null;
}

function toInt(value: string | undefined): number {
	return value ? parseInt(value, 10) : 0;
}
