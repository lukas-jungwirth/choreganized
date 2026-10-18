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
import { isoDurationToMinutes, mapYield, type RecipeJsonLd } from './recipe-jsonld';

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
		ingredientLines: [...(props.get('recipeIngredient') ?? []), ...(props.get('ingredients') ?? [])]
			.map((element) => clean(valueOf(element)))
			.filter(Boolean),
		steps: (props.get('recipeInstructions') ?? []).flatMap(stepsOf),
		image: first('image') ? valueOf(first('image')!) || null : null
	};

	// A Recipe scope with nothing in it is a template stub, not a recipe.
	if (!recipe.name && !recipe.ingredientLines.length && !recipe.steps.length) return null;
	return recipe;
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

	// Top-level blocks only: an ingredient list inside a step is part of that step.
	const blocks = element
		.querySelectorAll('li, p')
		.filter((block) => !hasBlockAncestor(block, element));
	const lines = blocks.length
		? blocks.map((block) => block.text)
		: element.structuredText.split(/\n+/);

	return lines.map((line) => clean(line).replace(/^\d+[.)]\s+/, '')).filter(Boolean);
}

function hasBlockAncestor(block: HTMLElement, within: HTMLElement): boolean {
	let parent = block.parentNode as HTMLElement | null;
	while (parent && parent !== within) {
		if (['li', 'p'].includes(parent.tagName?.toLowerCase())) return true;
		parent = parent.parentNode as HTMLElement | null;
	}
	return false;
}

function clean(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
