/**
 * The pieces of the test workflow that live in different files and have to
 * agree (→ docs/TESTING.md). A Playwright upgrade that bumps package-lock but
 * not the workflow image would compare baselines from two Chromium builds —
 * and every visual test would fail for a reason nobody could see in a diff.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { playwrightImage } from '../../scripts/playwright-image';
import { sourceFiles } from '../helpers/source';

describe('the CI workflows', () => {
	it('run the browser suites in the Playwright image at the installed version', () => {
		const expected = playwrightImage();
		const images = sourceFiles('.github/workflows', ['.yml']).flatMap((file) =>
			Array.from(
				file.text.matchAll(/mcr\.microsoft\.com\/playwright:[\w.-]+/g),
				(m) => `${file.path} → ${m[0]}`
			)
		);

		assert.ok(images.length >= 2, 'ci.yml and update-snapshots.yml both run in the image');
		for (const image of images) {
			assert.ok(image.endsWith(`→ ${expected}`), `${image}, but the installed one is ${expected}`);
		}
	});

	it('the gate runs every layer', () => {
		const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
		for (const step of ['npm run lint', 'npm run check', 'npm test', 'npx playwright test']) {
			assert.ok(ci.includes(step), `ci.yml runs \`${step}\``);
		}
	});
});
