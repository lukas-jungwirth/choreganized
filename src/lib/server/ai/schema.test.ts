/**
 * The output-schema builders (→ plan 20): one schema, written in the strict
 * subset every provider accepts, and Gemini's dialect derived from it. A
 * schema OpenAI's strict mode rejects fails every call to that provider, so the
 * strict rules are pinned here rather than discovered with a real key.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { array, integer, nullable, object, string, toGeminiSchema } from './schema';

const recipe = object({
	name: string({ description: 'Title' }),
	servings: nullable(integer()),
	unit: nullable(string({ enum: ['g', 'ml'] })),
	steps: array(object({ text: string() }))
});

describe('object', () => {
	it('requires every property and allows nothing else (strict mode)', () => {
		assert.deepEqual(recipe.required, ['name', 'servings', 'unit', 'steps']);
		assert.equal(recipe.additionalProperties, false);
		const step = (recipe.properties as Record<string, { items: Record<string, unknown> }>).steps
			.items;
		assert.equal(step.additionalProperties, false);
	});

	it('spells "may be missing" as a union with null, never an optional field', () => {
		const servings = (recipe.properties as Record<string, unknown>).servings;
		assert.deepEqual(servings, { anyOf: [{ type: 'integer' }, { type: 'null' }] });
	});
});

describe('toGeminiSchema', () => {
	const gemini = toGeminiSchema(recipe);
	const props = gemini.properties as Record<string, Record<string, unknown>>;

	it('upper-cases types and keeps the order the schema reads in', () => {
		assert.equal(gemini.type, 'OBJECT');
		assert.deepEqual(gemini.propertyOrdering, ['name', 'servings', 'unit', 'steps']);
		assert.equal(props.name.description, 'Title');
	});

	it('turns a union with null into nullable', () => {
		assert.deepEqual(props.servings, { type: 'INTEGER', nullable: true });
		assert.deepEqual(props.unit, { type: 'STRING', enum: ['g', 'ml'], nullable: true });
	});

	it('drops additionalProperties, which the dialect doesn’t have', () => {
		assert.equal('additionalProperties' in gemini, false);
		const step = props.steps.items as Record<string, unknown>;
		assert.equal(step.type, 'OBJECT');
		assert.equal('additionalProperties' in step, false);
	});
});
