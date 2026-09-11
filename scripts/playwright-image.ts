/**
 * The container the browser suites run in — locally (→ scripts/visual.ts) and in
 * CI (→ .github/workflows). One place for the tag, checked against the workflow
 * files by tests/conventions/ci.test.ts, so a Playwright upgrade cannot leave
 * the two comparing baselines from different Chromium builds.
 */
import { readFileSync } from 'node:fs';

export function playwrightImage(): string {
	const { version } = JSON.parse(
		readFileSync('node_modules/@playwright/test/package.json', 'utf8')
	) as { version: string };
	return `mcr.microsoft.com/playwright:v${version}-noble`;
}
