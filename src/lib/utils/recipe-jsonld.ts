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
	/**
	 * The part each ingredient line belongs to, by index ("Bolognese"), or null
	 * (→ plan 44): a heading row in the list, or the page's plugin markup
	 * (`recipe-plugins.ts`). As long as `ingredientLines`.
	 */
	ingredientSections: (string | null)[];
	steps: string[];
	/** The part each step belongs to: a `HowToSection`'s name or a heading step. As long as `steps`. */
	stepSections: (string | null)[];
	/** The first usable image candidate, **unresolved** — the caller makes it
	 *  absolute and decides whether it's safe to fetch. */
	image: string | null;
	/**
	 * What the page says the dish is — `recipeCategory`, `keywords` and
	 * `suitableForDiet`, as written — for `tagsFromLabels` to map onto our tags
	 * (→ plan 41). Decoded and trimmed; a keyword string stays one label.
	 */
	labels: string[];
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

/**
 * A card that is no card: no steps and the whole recipe in one long
 * "ingredient" (cookingcatrin.at marks its entire recipe box as one
 * `recipeIngredient`). Read as a card it would open as one row of 1,500
 * characters; without it the page goes down the no-card road, where a model
 * reads its text (→ plan 44). Exported for the Microdata reader.
 */
export function isBlobCard(card: Pick<RecipeJsonLd, 'ingredientLines' | 'steps'>): boolean {
	return (
		card.steps.length === 0 &&
		card.ingredientLines.length === 1 &&
		card.ingredientLines[0].length > BLOB_LINE_CHARS
	);
}

/** Longer than any real ingredient line, shorter than any recipe. */
const BLOB_LINE_CHARS = 200;

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
	// `ingredients` is the deprecated spelling some older sites still emit.
	const ingredients = tidyIngredients(mapLines(node.recipeIngredient ?? node.ingredients));
	const steps = tidySteps(mapInstructions(node.recipeInstructions));
	return {
		name: cleanText(asString(node.name) ?? ''),
		timeMinutes: mapTime(node),
		servings: mapYield(node.recipeYield),
		ingredientLines: ingredients.lines,
		ingredientSections: ingredients.sections,
		steps: steps.steps,
		stepSections: steps.sections,
		image: mapImage(node.image),
		labels: mapLabels([node.recipeCategory, node.keywords, node.suitableForDiet])
	};
}

/* ── Labels ───────────────────────────────────────────────────────────────── */

/**
 * Every string in the label fields: plain strings, arrays of them, and the
 * `{ "@id": "https://schema.org/VeganDiet" }` objects a diet sometimes is.
 * Capped, because a keyword field is where SEO goes to be long.
 */
export function mapLabels(values: unknown[]): string[] {
	const labels: string[] = [];
	const walk = (value: unknown, depth: number) => {
		if (depth > 3 || labels.length >= MAX_LABELS) return;
		if (typeof value === 'string') {
			const text = cleanText(value).slice(0, MAX_LABEL_CHARS);
			if (text) labels.push(text);
		} else if (Array.isArray(value)) {
			for (const one of value) walk(one, depth + 1);
		} else if (isObject(value)) {
			walk(value['@id'] ?? value.name ?? value['@value'], depth + 1);
		}
	};
	for (const value of values) walk(value, 0);
	return labels;
}

const MAX_LABELS = 40;
const MAX_LABEL_CHARS = 400;

/* ── Time ─────────────────────────────────────────────────────────────────── */

/**
 * ISO-8601 durations, `PnWnDTnHnMnS` — the only forms a recipe uses. Years and
 * months are meaningless for cooking time and deliberately unmatched (a string
 * carrying them falls through to null rather than mis-summing).
 */
const ISO_DURATION =
	/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

function mapTime(node: Record<string, unknown>): number | null {
	const total = durationToMinutes(asString(node.totalTime));
	if (total) return total;

	// No total given: the sum of the two halves is what the header would show.
	const parts =
		(durationToMinutes(asString(node.prepTime)) ?? 0) +
		(durationToMinutes(asString(node.cookTime)) ?? 0);
	return parts > 0 ? parts : null;
}

/**
 * A duration as the spec writes it, or as a site writes it in words instead:
 * bonappetit.com sends `"totalTime": "5 hours 45 minutes"` (→ plan 44).
 * Exported for the Microdata reader.
 */
export function durationToMinutes(value: string | null): number | null {
	return isoDurationToMinutes(value) ?? wordsDurationToMinutes(value);
}

/** "5 hours 45 minutes", "1 Std. 30 Min.", "90 min": every number with its unit, summed. */
function wordsDurationToMinutes(value: string | null): number | null {
	if (!value) return null;
	let total = 0;
	let read = false;
	for (const [, amount, unit] of value.matchAll(DURATION_WORD)) {
		const number = Number(amount.replace(',', '.'));
		total += /^(?:h|hours?|hrs?|std|stunden?)/i.test(unit) ? number * 60 : number;
		read = true;
	}
	const minutes = Math.round(total);
	return read && minutes > 0 ? minutes : null;
}

const DURATION_WORD =
	/(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|stunden?|std|minutes?|mins?|minuten?|m)\b\.?/gi;

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

/** A step or a line with the part it was found under. */
export type SectionedText = { text: string; section: string | null };

/**
 * `recipeInstructions` comes in every shape the spec allows: one string, an array
 * of strings, an array of `HowToStep` objects, or `HowToSection`s each wrapping
 * their own `itemListElement` of steps. Flatten them all, in order, to step texts,
 * each with the name of the `HowToSection` it was in (→ plan 44).
 */
function mapInstructions(value: unknown): SectionedText[] {
	const steps: SectionedText[] = [];
	collectSteps(value, steps, null);
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

function collectSteps(value: unknown, into: SectionedText[], section: string | null): void {
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
				into.push({ text: pending, section });
				pending = '';
			}
		}
		if (pending) into.push({ text: pending, section });
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) collectSteps(item, into, section);
		return;
	}

	if (isObject(value)) {
		if (isType(value, 'HowToSection')) {
			const title = asString(value.name);
			collectSteps(value.itemListElement, into, (title ? sectionName(title) : null) ?? section);
			return;
		}
		// `name` is a step's title ("Eier"), not its instruction — a lone word is no step.
		const name = asString(value.name);
		const text = stepText(value.text) ?? (name && /\s/.test(name.trim()) ? name : null);
		if (text) {
			const cleaned = cleanText(text);
			if (cleaned) into.push({ text: cleaned, section });
			return;
		}
		// An untyped wrapper that still holds a list of steps.
		if (value.itemListElement !== undefined) collectSteps(value.itemListElement, into, section);
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
 * leftover numbering off ("1. ", "Schritt 2:"), template leftovers out
 * (`stripTemplateLeftovers`), and a heading (a short line ending on a colon,
 * "Orangensalat:", or a title of a few words, "Karottenkuchen") made the part
 * of the steps after it instead of a step that says nothing to do (→ plan 44;
 * before, it was glued to the next step's text). A part that covers every step
 * is no part ("Zubereitung"). Exported for the Microdata reader.
 */
export function tidySteps(steps: (string | SectionedText)[]): {
	steps: string[];
	sections: (string | null)[];
} {
	const rows = steps
		.map((one) => (typeof one === 'string' ? { text: one, section: null } : one))
		.map((one) => ({
			text: stripTemplateLeftovers(one.text.replace(STEP_NUMBER, '')).trim(),
			section: one.section
		}))
		.filter((one) => one.text);

	const tidy: SectionedText[] = [];
	// A heading names the steps after it until the card's own part changes.
	let heading: { name: string | null; under: string | null } | null = null;
	// A bare title ("Karottenkuchen") is a heading only when the card opens on one
	// and has another: one short step alone ("Teig kneten") is an instruction.
	const titles = rows.filter((row) => isTitle(row.text));
	const titled = titles.length >= 2 && titles[0] === rows[0];

	rows.forEach((row, at) => {
		if (heading && heading.under !== row.section) heading = null;
		// A heading heads something in its own part; the last row of a part is a step.
		const headsNext = at < rows.length - 1 && rows[at + 1].section === row.section;
		const isPart = isColonHeading(row.text) || (titled && isTitle(row.text));
		if (headsNext && isPart) {
			heading = { name: sectionName(row.text), under: row.section };
			return;
		}
		tidy.push({ text: row.text, section: heading?.name ?? row.section });
	});

	return {
		steps: tidy.map((row) => row.text),
		sections: loneSectionOff(tidy.map((row) => row.section))
	};
}

/** "1. ", "2) ", "Schritt 3:", "Step 4 –" — a list's numbering, not the instruction. */
const STEP_NUMBER = /^(?:(?:schritt|step)\s*\d{1,2}\s*[:.)–-]?\s*|\d{1,2}[.)]\s+)/i;

/**
 * A section title: ends on a colon and is short enough to be a label, not an
 * instruction. `isTitle`: a few words with no number and no sentence end
 * ("Karottenkuchen", "Frischkäse-Frosting und Finish", kochbar.de), a heading
 * only in the company `tidySteps` asks for.
 */
function isColonHeading(line: string): boolean {
	return line.endsWith(':') && line.split(/\s+/).length <= HEADING_MAX_WORDS;
}

function isTitle(line: string): boolean {
	const words = line.split(/\s+/).length;
	return words <= TITLE_MAX_WORDS && !/\d/.test(line) && !/[.!?:;,)]$/.test(line);
}

const HEADING_MAX_WORDS = 15;
const TITLE_MAX_WORDS = 4;

/**
 * Template code a site left in its text (→ plan 44): gutekueche.at writes
 * `{{ link("RZT", 43664, "Lasagneblätter") }}` (the link's words stay),
 * hellofresh writes each portion size's amount, `1 EL [1,5 EL | 2 EL] Öl*`
 * (the first stays; the others, and the asterisk marking what you have at
 * home, go). Exported for the tests.
 */
export function stripTemplateLeftovers(text: string): string {
	return text
		.replace(/\{\{\s*\w+\(([^)]*)\)\s*\}\}/g, (_, args: string) => {
			const quoted = [...args.matchAll(/["']([^"']*)["']/g)].map((match) => match[1]);
			return quoted.at(-1) ?? '';
		})
		.replace(/\s*\[[^\]|]*\|[^\]]*\]/g, '')
		.replace(/(\p{L})\*+/gu, '$1')
		.replace(/\s{2,}/g, ' ');
}

/**
 * A card's ingredient lines as rows: a section title ("Für den Teig:",
 * "KATSU CURRY SAUCE") is no ingredient: it names the part of the rows after it
 * (→ plan 44; before, it was dropped). A line the site split on its own comma is
 * put back together: einfachkochen.de sends "200 ml Milch (1,8 % Fett)" as
 * "200 ml Milch (1" and "8 % Fett)", the same split as #31's steps, so a line
 * that opens a bracket it doesn't close takes the next line in. And what sites
 * leave in a line that is no part of it goes (`tidyIngredientLine`).
 * Exported for the Microdata reader.
 */
export function tidyIngredients(lines: string[]): {
	lines: string[];
	sections: (string | null)[];
} {
	const tidy: string[] = [];
	const sections: (string | null)[] = [];
	let section: string | null = null;

	for (let at = 0; at < lines.length; at++) {
		let line = lines[at];
		// Only when the next line closes it: a bracket a site simply never closed
		// must not swallow the rest of the list.
		while (unclosed(line) && at + 1 < lines.length && lines[at + 1].includes(')')) {
			const next = lines[++at];
			// A decimal comma has no space after it; a list comma does.
			line = /\d$/.test(line) && /^\d/.test(next) ? `${line},${next}` : `${line}, ${next}`;
		}
		if (isIngredientHeading(line)) {
			section = sectionName(line);
			continue;
		}
		const cleaned = tidyIngredientLine(line);
		if (!cleaned) continue;
		tidy.push(cleaned);
		sections.push(section);
	}

	return { lines: tidy, sections: loneSectionOff(sections) };
}

/** "Für den Teig:", "KATSU CURRY SAUCE", "Für die Füllung": a title, not a thing to buy. */
function isIngredientHeading(line: string): boolean {
	if (/^[\d½¼¾⅓⅔⅛]/.test(line)) return false;
	if (line.endsWith(':')) return true;
	if (/\d/.test(line)) return false;
	const letters = line.replace(/[^\p{L}]/gu, '');
	const shouted =
		letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
	// "Für die Form: Butter" is butter, not a heading: a colon inside names the thing after it.
	const titled = /^(?:für|for)\s/i.test(line) && !line.includes(':');
	return shouted || (titled && line.split(/\s+/).length <= 5);
}

/**
 * What a recipe plugin leaves in an ingredient line that is not the line
 * (→ plan 44): a price, "($0.36)" (Budget Bytes); a footnote, "(Note 1)" or
 * "- Note 3" (recipetineats.com); WP Recipe Maker's notes in brackets that open
 * on their own comma, "1 onion (, finely chopped)" for "1 onion, finely
 * chopped"; a bracket doubled once the footnote is gone; an asterisk.
 * Exported for the tests.
 */
export function tidyIngredientLine(line: string): string {
	let text = stripTemplateLeftovers(line)
		.replace(/\s*\((?:[$€£]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?[$€£])\)/g, '')
		.replace(/\s*\((?:see\s+)?notes?\s*\d+\)/gi, '')
		.replace(/\s*[-–]\s*notes?\s*\d+\b/gi, '')
		.replace(/\*+/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
	// "((ground beef))" → "(ground beef)", "()" → "".
	for (let pass = 0; pass < 3; pass++) {
		text = text
			.replace(/\(\s*\(([^()]*)\)\s*\)/g, '($1)')
			.replace(/\s*\(\s*\)/g, '')
			.trim();
	}
	return text.replace(/\s*\(\s*,\s*(.*)\)$/, ', $1').trim();
}

/**
 * A part's name as the screens show it (→ plan 43: as written, at most 40
 * characters): no closing colon, no "Für die" / "For the" in front, shouting
 * lowered ("FÜR DIE BOLOGNESESAUCE" → "Bolognesesauce"), a remark in brackets
 * dropped when the name is too long. Null for a heading that names no part
 * ("Zutaten", "Zubereitung", "Instructions"). Exported for the plugin reader.
 */
export function sectionName(raw: string): string | null {
	let name = cleanText(raw)
		.replace(/\s*:\s*$/, '')
		.replace(/\s*:\s*/g, ' ');
	const letters = name.replace(/[^\p{L}]/gu, '');
	if (letters && letters === letters.toUpperCase()) name = name.toLowerCase();
	name = name
		.replace(/^(?:zutaten\s+)?f(?:ü|ue)r\s+(?:den|die|das|dem)\s+/i, '')
		.replace(/^(?:zutaten\s+)?f(?:ü|ue)r\s+/i, '')
		.replace(/^for\s+(?:the\s+)?/i, '')
		.trim();
	if (name.length > SECTION_MAX) name = name.replace(/\s*\([^)]*\)/g, '').trim();
	if (name.length > SECTION_MAX) name = name.slice(0, SECTION_MAX).replace(/\s+\S*$/, '');
	if (!name || /^\d/.test(name) || GENERIC_HEADING.test(name)) return null;
	return name[0].toUpperCase() + name.slice(1);
}

/** As `recipe_ingredients.section` caps it (→ plan 43). */
const SECTION_MAX = 40;

const GENERIC_HEADING =
	/^(?:zutaten|zubereitung|anleitung|so geht'?s|ingredients?|instructions?|method|directions?|steps?|preparation)$/i;

/**
 * One part that every row is in is no part: a card's "Zubereitung" around all
 * its steps. Exported for the plugin reader.
 */
export function loneSectionOff(sections: (string | null)[]): (string | null)[] {
	if (new Set(sections).size === 1 && sections[0] !== null) return sections.map(() => null);
	return sections;
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
	Auml: 'Ä',
	Ouml: 'Ö',
	Uuml: 'Ü',
	Eacute: 'É',
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
