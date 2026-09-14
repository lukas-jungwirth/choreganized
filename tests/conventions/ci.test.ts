/**
 * The pieces of the test workflow that live in different files and have to
 * agree (→ docs/TESTING.md). A Playwright upgrade that bumps package-lock but
 * not the workflow image would compare baselines from two Chromium builds —
 * and every visual test would fail for a reason nobody could see in a diff.
 *
 * And the shape of the build workflow (→ docs/plans/18-agent-build.md,
 * DECISIONS #143): the brakes on an agent that writes code from an untrusted
 * issue are a handful of lines of YAML, so a line that goes missing should
 * fail here with a sentence, not in a pull request nobody asked for.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { playwrightImage } from '../../scripts/playwright-image';
import { sourceFiles } from '../helpers/source';

const workflow = (name: string) => {
	const path = `.github/workflows/${name}`;
	assert.ok(existsSync(path), `${path} exists`);
	return readFileSync(path, 'utf8');
};

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
		const ci = workflow('ci.yml');
		for (const step of ['npm run lint', 'npm run check', 'npm test', 'npx playwright test']) {
			assert.ok(ci.includes(step), `ci.yml runs \`${step}\``);
		}
	});
});

describe('the build workflow', () => {
	it('fires on a label and by hand, nothing else', () => {
		const build = workflow('build.yml');
		const on = build.slice(build.indexOf('\non:'), build.indexOf('\nconcurrency:'));
		assert.match(on, /issues:\n\s+types: \[labeled\]/, 'the trigger is a label');
		assert.ok(on.includes('workflow_dispatch:'), 'and a retry by hand');
		for (const event of ['pull_request', 'push:', 'issue_comment', 'schedule', 'workflow_run']) {
			assert.ok(!on.includes(event), `build.yml must not fire on ${event}`);
		}
	});

	it('lets a bot start only a small, located bug', () => {
		const build = workflow('build.yml');
		for (const term of [
			"github.event.label.name == 'agent:build'",
			"github.event.sender.type != 'Bot'",
			"contains(github.event.issue.labels.*.name, 'bug')",
			"contains(github.event.issue.labels.*.name, 'size:s')"
		]) {
			assert.ok(build.includes(term), `the job's if: names ${term}`);
		}
	});

	it('can merge only by auto-merge, and cannot touch workflows or the web', () => {
		const build = workflow('build.yml');
		assert.ok(!/^\s+workflows:/m.test(build), 'no workflows permission');
		assert.ok(!/actions:\s*write/.test(build), 'no actions: write');
		const tools = build.match(/--allowedTools "([^"]+)"/)?.[1];
		assert.ok(tools, 'an explicit --allowedTools list');
		const merges = tools.split(',').filter((tool) => tool.startsWith('Bash(gh pr merge'));
		assert.deepEqual(merges, ['Bash(gh pr merge --auto:*)'], 'auto-merge is the one merge command');
		for (const tool of ['WebFetch', 'WebSearch', 'Bash(gh api', 'Bash(gh workflow']) {
			assert.ok(!tools.includes(tool), `${tool} is not allowed`);
		}
	});

	it('builds one issue at a time and never cancels a build', () => {
		assert.match(
			workflow('build.yml'),
			/concurrency:\n\s+group: build\n\s+cancel-in-progress: false/,
			'serial, and a half-built branch is never thrown away'
		);
	});

	it('runs the prompt that exists, and triage knows how to hand on', () => {
		assert.ok(
			workflow('build.yml').includes("prompt: '/build-issue "),
			'the prompt is the slash command'
		);
		assert.ok(existsSync('.claude/commands/build-issue.md'), 'the slash command exists');
		const triage = readFileSync('.claude/commands/triage-issue.md', 'utf8');
		assert.ok(triage.includes('agent:build'), 'triage hands on with the label');
	});
});
