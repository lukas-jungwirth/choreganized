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
 * the loose `[^>]*` on either side.
 */
const LD_SCRIPT =
	/<script\b[^>]*\btype\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;

/** The first `Recipe` any JSON-LD block on the page describes, mapped — or null. */
export function parseRecipeJsonLd(html: string): RecipeJsonLd | null {
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
			if (isType(node, 'Recipe')) return mapRecipe(node);
		}
	}

	return null;
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
 * Every object worth checking for a `@type`, flattened: the value itself, each
 * item of an array, and the members of a `@graph` wrapper (Yoast and friends put
 * the whole page's nodes in one). Deliberately shallow — `@graph` and arrays, not
 * arbitrary nesting — which is where JSON-LD actually keeps its top-level nodes.
 */
function* ldNodes(data: unknown): Generator<Record<string, unknown>> {
	if (Array.isArray(data)) {
		for (const item of data) yield* ldNodes(item);
	} else if (isObject(data)) {
		yield data;
		if (data['@graph'] !== undefined) yield* ldNodes(data['@graph']);
	}
}

/**
 * Whether a node's `@type` names `type`. `@type` is a string or an array of them
 * ("Recipe", or `["Recipe", "NewsArticle"]`), and case is not guaranteed, so both
 * forms are matched case-insensitively.
 */
function isType(node: Record<string, unknown>, type: string): boolean {
	const declared = node['@type'];
	const want = type.toLowerCase();
	if (typeof declared === 'string') return declared.toLowerCase() === want;
	if (Array.isArray(declared)) {
		return declared.some((one) => typeof one === 'string' && one.toLowerCase() === want);
	}
	return false;
}

function mapRecipe(node: Record<string, unknown>): RecipeJsonLd {
	return {
		name: cleanText(asString(node.name) ?? ''),
		timeMinutes: mapTime(node),
		servings: mapYield(node.recipeYield),
		// `ingredients` is the deprecated spelling some older sites still emit.
		ingredientLines: mapLines(node.recipeIngredient ?? node.ingredients),
		steps: mapInstructions(node.recipeInstructions),
		image: mapImage(node.image)
	};
}

/* ── Time ─────────────────────────────────────────────────────────────────── */

/**
 * ISO-8601 durations, `PnWnDTnHnMnS` — the only forms a recipe uses. Years and
 * months are meaningless for cooking time and deliberately unmatched (a string
 * carrying them falls through to null rather than mis-summing).
 */
const ISO_DURATION = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

function mapTime(node: Record<string, unknown>): number | null {
	const total = isoDurationToMinutes(asString(node.totalTime));
	if (total) return total;

	// No total given: the sum of the two halves is what the header would show.
	const parts =
		(isoDurationToMinutes(asString(node.prepTime)) ?? 0) +
		(isoDurationToMinutes(asString(node.cookTime)) ?? 0);
	return parts > 0 ? parts : null;
}

function isoDurationToMinutes(value: string | null): number | null {
	if (!value) return null;
	const match = ISO_DURATION.exec(value.trim());
	if (!match) return null;

	const [, weeks, days, hours, minutes, seconds] = match;
	const total =
		toInt(weeks) * 7 * 24 * 60 +
		toInt(days) * 24 * 60 +
		toInt(hours) * 60 +
		toInt(minutes) +
		Math.round(Number(seconds ?? 0) / 60);

	return total > 0 ? total : null;
}

/* ── Servings ─────────────────────────────────────────────────────────────── */

/**
 * `recipeYield` is a number, a string ("4 Portionen", "serves 4-6"), or an array
 * of either. Take the first digit run of whatever it is — the amount, wherever
 * the words put it.
 */
function mapYield(value: unknown): number | null {
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

function collectSteps(value: unknown, into: string[]): void {
	if (value == null) return;

	if (typeof value === 'string') {
		// A single string is often the whole method with the steps on their own
		// lines — split so it isn't one giant step. (A HowToStep's own text, by
		// contrast, has its newlines collapsed by `cleanText` and stays one step.)
		for (const part of value.split(/\r?\n+/)) {
			const text = cleanText(part);
			if (text) into.push(text);
		}
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
		const text = asString(value.text) ?? asString(value.name);
		if (text) {
			const cleaned = cleanText(text);
			if (cleaned) into.push(cleaned);
			return;
		}
		// An untyped wrapper that still holds a list of steps.
		if (value.itemListElement !== undefined) collectSteps(value.itemListElement, into);
	}
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

/** Tags stripped, entities decoded, whitespace collapsed — what a field is worth. */
function cleanText(raw: string): string {
	return decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
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

function decodeEntities(text: string): string {
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
