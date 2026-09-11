/**
 * "Svelte 5 runes — never legacy `$:`, `export let`, or stores" (CLAUDE.md).
 * The compiler already refuses legacy syntax in runes mode for most of these;
 * this catches the ones it lets through (stores, slots, the dispatcher) and
 * keeps the message in the repo's own words.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { linesMatching, sourceFiles } from '../helpers/source';

const LEGACY: [RegExp, string][] = [
	[/^\s*export let /, '`export let` → `$props()`'],
	[/^\s*\$:\s/, '`$:` → `$derived()` / `$effect()`'],
	[/<slot\b/, '`<slot>` → snippets'],
	[/createEventDispatcher/, '`createEventDispatcher` → callback props'],
	[/from\s+['"]svelte\/store['"]/, '`svelte/store` → `$state()` in a `.svelte.ts` module']
];

const files = sourceFiles('src', ['.svelte', '.svelte.ts']);

describe('svelte 5 runes only', () => {
	for (const [pattern, fix] of LEGACY) {
		it(`no ${fix.split(' → ')[0]}`, () => {
			const offenders = files.flatMap((file) => linesMatching(file, pattern));
			assert.deepEqual(offenders, [], fix);
		});
	}
});
