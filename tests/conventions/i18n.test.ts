/**
 * The language rules that types can't see (→ CLAUDE.md "No user-facing string
 * in a component", ARCHITECTURE "Language", SPEC §9). `de.ts` is typed against
 * `en.ts`, so a *missing* key fails `npm run check`; what is checked here is the
 * shape of the calls around the catalog.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { linesMatching, sourceFiles } from '../helpers/source';

describe('i18n', () => {
	it('dates are rendered through m.date.*, never formatShortDate directly', () => {
		const offenders = sourceFiles('src/routes', ['.svelte'])
			.concat(sourceFiles('src/lib/components', ['.svelte']))
			.flatMap((file) => linesMatching(file, /formatShortDate\(/));

		assert.deepEqual(offenders, [], 'Timezone and language are separate axes (→ CLAUDE.md).');
	});

	it('en.ts and de.ts export the same top-level sections', () => {
		const sections = (path: string) =>
			Array.from(
				sourceFiles('src/lib/i18n/messages', ['.ts'])
					.find((f) => f.path.endsWith(path))!
					.text.matchAll(/^\t([a-zA-Z]+): \{/gm),
				(m) => m[1]
			).sort();

		assert.deepEqual(sections('de.ts'), sections('en.ts'));
	});
});
