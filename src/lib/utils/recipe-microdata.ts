/**
 * A page's Schema.org `Recipe` written as **Microdata** → the same draft the
 * JSON-LD reader produces (→ SPEC §4.7, plan 22).
 *
 * Most recipe sites hand Google their recipe card as JSON-LD, which
 * `recipe-jsonld.ts` reads. Some — older templates, hand-built blogs — write
 * the same card into the visible HTML instead: `itemscope
 * itemtype="https://schema.org/Recipe"` on a wrapper, `itemprop="recipeIngredient"`
 * on each ingredient. Reading that too costs no AI call, is instant, and is
 * exactly what the site says; without it those pages fell through to "no recipe
 * found".
 *
 * An HTML parser (`node-html-parser`), not regexes, because Microdata nests: an
 * `author` is an `itemscope` of its own whose `name` is the cook's, not the
 * dish's, and only a tree can tell which scope a property belongs to
 * (→ DECISIONS #148).
 */
import { parse, type HTMLElement } from 'node-html-parser';
import {
	cardSize,
	isoDurationToMinutes,
	mapYield,
	tidyIngredientLines,
	tidySteps,
	type RecipeJsonLd
} from './recipe-jsonld';

/** `itemtype` is a space-separated list of type URLs. */
const RECIPE_TYPE = /(?:^|\s)https?:\/\/schema\.org\/Recipe(?:\s|$)/i;

export function parseRecipeMicrodata(html: string): RecipeJsonLd | null {
	let root: HTMLElement;
	try {
		root = parse(html);
	} catch {
		return null;
	}

	const scope = root
		.querySelectorAll('[itemscope]')
		.find((element) => RECIPE_TYPE.test(element.getAttribute('itemtype') ?? ''));
	if (!scope) return null;

	const props = ownProperties(scope);
	const first = (name: string) => props.get(name)?.[0] ?? null;

	const recipe: RecipeJsonLd = {
		name: clean(first('name') ? valueOf(first('name')!) : ''),
		timeMinutes: time(props),
		servings: mapYield(first('recipeYield') ? valueOf(first('recipeYield')!) : null),
		// `ingredients` is the deprecated spelling, as in JSON-LD.
		ingredientLines: tidyIngredientLines(
			[...(props.get('recipeIngredient') ?? []), ...(props.get('ingredients') ?? [])]
				.map((element) => clean(valueOf(element)))
				.filter(Boolean)
		),
		steps: tidySteps(
			props.has('recipeInstructions')
				? props.get('recipeInstructions')!.flatMap(stepsOf)
				: markedUpSteps(scope)
		),
		image: first('image') ? valueOf(first('image')!) || null : null
	};

	// A Recipe scope with no rows is a template stub or a teaser, not a recipe.
	return cardSize(recipe) ? recipe : null;
}

/**
 * Where recipe plugins put the method when they don't mark it up as
 * `recipeInstructions`: the h-recipe microformat's `e-instructions` (Jetpack's
 * recipe card on smittenkitchen.com marks its ingredients as Microdata and its
 * directions only this way), and the plugins' own wrappers.
 */
const INSTRUCTION_BLOCKS =
	'.e-instructions, .jetpack-recipe-directions, .wprm-recipe-instructions, .tasty-recipes-instructions, .mv-create-instructions';

/**
 * A method the page shows but its recipe card doesn't carry — read from the
 * first instruction block a plugin left, inside `within` (a Microdata scope or
 * the whole page). For a JSON-LD card that came without steps, too
 * (→ `server/recipe-import.ts`).
 */
export function markedUpSteps(within: HTMLElement | string): string[] {
	let root: HTMLElement;
	try {
		root = typeof within === 'string' ? parse(within) : within;
	} catch {
		return [];
	}
	const block = root.querySelector(INSTRUCTION_BLOCKS);
	return block ? stepsOf(block) : [];
}

/**
 * The properties that belong to *this* item: every `itemprop` below it whose
 * nearest `itemscope` ancestor is the item itself. A property element that is
 * also an `itemscope` (a `HowToStep`) belongs to the outer item; its children
 * belong to it.
 */
function ownProperties(scope: HTMLElement): Map<string, HTMLElement[]> {
	const props = new Map<string, HTMLElement[]>();

	for (const element of scope.querySelectorAll('[itemprop]')) {
		let parent = element.parentNode as HTMLElement | null;
		while (parent && parent !== scope && !parent.hasAttribute?.('itemscope')) {
			parent = parent.parentNode as HTMLElement | null;
		}
		if (parent !== scope) continue;

		for (const name of (element.getAttribute('itemprop') ?? '').split(/\s+/).filter(Boolean)) {
			const list = props.get(name);
			if (list) list.push(element);
			else props.set(name, [element]);
		}
	}

	return props;
}

/** A property's value the way Microdata defines it: an attribute for some elements, text for the rest. */
function valueOf(element: HTMLElement): string {
	const tag = element.tagName?.toLowerCase();
	const attribute = (name: string) => element.getAttribute(name) ?? '';

	if (tag === 'meta') return attribute('content');
	if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio')
		return attribute('src');
	if (tag === 'a' || tag === 'link' || tag === 'area') return attribute('href');
	if (tag === 'time') return attribute('datetime') || element.text;
	if (tag === 'data' || tag === 'meter') return attribute('value') || element.text;
	return attribute('content') || element.text;
}

/** `totalTime`, else `prepTime` + `cookTime` — the JSON-LD reader's rule. */
function time(props: Map<string, HTMLElement[]>): number | null {
	const minutes = (name: string) => {
		const element = props.get(name)?.[0];
		return element ? isoDurationToMinutes(valueOf(element).trim()) : null;
	};

	const total = minutes('totalTime');
	if (total) return total;
	const parts = (minutes('prepTime') ?? 0) + (minutes('cookTime') ?? 0);
	return parts > 0 ? parts : null;
}

/**
 * One `recipeInstructions` property → its steps. A `HowToStep` item says its
 * text in its own `text` (or `name`) property; a `HowToSection` lists steps; a
 * plain element is the whole method, one step per list item, paragraph or line.
 */
function stepsOf(element: HTMLElement): string[] {
	if (element.hasAttribute('itemscope')) {
		const own = ownProperties(element);
		const nested = own.get('itemListElement') ?? own.get('step');
		if (nested?.length) return nested.flatMap(stepsOf);
		const title = own.get('name')?.[0];
		const text = own.get('text')?.[0] ?? (title && /\s/.test(clean(valueOf(title))) ? title : null);
		if (text) return [clean(valueOf(text))].filter(Boolean);
		// A step with no text property of its own is its whole markup — often the ingredient
		// list followed by the instruction. One step, never split into rows.
		return [clean(element.structuredText).replace(/^\d+[.)]\s+/, '')].filter(Boolean);
	}

	return topLevelBlocks(element)
		.map((line) => clean(line).replace(/^\d+[.)]\s+/, ''))
		.filter(Boolean);
}

/**
 * A method's lines: each top-level `<li>`, `<p>` and heading whole — an ingredient list
 * inside a step is part of that step — and the loose text between them as a
 * line of its own (Jetpack opens its directions with a bare paragraph before
 * the first `<p>`). A `<br>` in loose text breaks it, as it does on screen.
 */
function topLevelBlocks(element: HTMLElement): string[] {
	const lines: string[] = [];
	let loose = '';
	const flush = () => {
		if (loose.trim()) lines.push(loose);
		loose = '';
	};

	for (const node of element.childNodes) {
		const tag = (node as HTMLElement).tagName?.toLowerCase();
		if (tag === 'li' || tag === 'p' || /^h[1-6]$/.test(tag ?? '')) {
			flush();
			lines.push(node.text);
		} else if (tag && CONTAINERS.has(tag)) {
			flush();
			lines.push(...topLevelBlocks(node as HTMLElement));
		} else if (tag === 'br') {
			flush();
		} else {
			loose += node.text;
		}
	}

	flush();
	return lines;
}

/** Block wrappers a method's lines are found inside, never lines themselves. */
const CONTAINERS = new Set(['ol', 'ul', 'div', 'section', 'article']);

function clean(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
