/**
 * Building an output schema every provider accepts (→ plan 20).
 *
 * The four disagree on JSON Schema at the edges, so the schemas here are
 * written in the strict subset all of them take — OpenAI's `strict: true`,
 * Anthropic's structured outputs, OpenRouter's `require_parameters` routes —
 * and converted once more for Gemini, whose `responseSchema` is an OpenAPI
 * dialect:
 *
 * - every object lists **all** of its properties as `required` and says
 *   `additionalProperties: false` (OpenAI and Anthropic refuse anything else);
 * - "or nothing" is `anyOf: [T, { type: 'null' }]`, never an optional property;
 * - no numeric or length constraints (`minimum`, `maxLength`) — neither OpenAI
 *   strict mode nor Anthropic accepts them, and the ranges are the validator's
 *   job anyway (→ `utils/recipe-draft.ts` from plan 22).
 */
import type { JsonSchema } from './types';

type Described = { description?: string };

export function string(options: Described & { enum?: readonly string[] } = {}): JsonSchema {
	return {
		type: 'string',
		...(options.enum ? { enum: [...options.enum] } : {}),
		...describe(options)
	};
}

export function integer(options: Described = {}): JsonSchema {
	return { type: 'integer', ...describe(options) };
}

export function number(options: Described = {}): JsonSchema {
	return { type: 'number', ...describe(options) };
}

export function boolean(options: Described = {}): JsonSchema {
	return { type: 'boolean', ...describe(options) };
}

export function array(items: JsonSchema, options: Described = {}): JsonSchema {
	return { type: 'array', items, ...describe(options) };
}

/** Every property required, nothing else allowed — the strict-mode rule. */
export function object(
	properties: Record<string, JsonSchema>,
	options: Described = {}
): JsonSchema {
	return {
		type: 'object',
		properties,
		required: Object.keys(properties),
		additionalProperties: false,
		...describe(options)
	};
}

/** `T` or `null`, the one way all four providers spell "may be missing". */
export function nullable(schema: JsonSchema): JsonSchema {
	const { description, ...rest } = schema as JsonSchema & Described;
	return {
		anyOf: [rest, { type: 'null' }],
		...(typeof description === 'string' ? { description } : {})
	};
}

function describe(options: Described): Described {
	return options.description ? { description: options.description } : {};
}

/**
 * The same schema in Gemini's `responseSchema` dialect: upper-case types,
 * `nullable: true` instead of a union with null, `propertyOrdering` so the
 * answer comes back in the order the schema reads, and no
 * `additionalProperties` (which that dialect doesn't have).
 *
 * `responseSchema` rather than the newer `responseJsonSchema` because it is
 * the one every Gemini model on the list accepts — a household can pick an
 * older model than the alias points at.
 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
	const anyOf = schema.anyOf;
	if (Array.isArray(anyOf)) {
		const real = anyOf.filter((option) => (option as JsonSchema).type !== 'null');
		const converted = toGeminiSchema(real[0] as JsonSchema);
		return {
			...converted,
			nullable: true,
			...(typeof schema.description === 'string' ? { description: schema.description } : {})
		};
	}

	const out: JsonSchema = {};
	const type = schema.type;
	if (typeof type === 'string') out.type = type.toUpperCase();
	if (typeof schema.description === 'string') out.description = schema.description;
	if (Array.isArray(schema.enum)) out.enum = schema.enum;

	if (type === 'object') {
		const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
		out.properties = Object.fromEntries(
			Object.entries(properties).map(([key, value]) => [key, toGeminiSchema(value)])
		);
		out.required = schema.required;
		out.propertyOrdering = Object.keys(properties);
	}

	if (type === 'array') out.items = toGeminiSchema(schema.items as JsonSchema);

	return out;
}
