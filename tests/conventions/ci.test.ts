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

/** A quoted tool list from `claude_args`, split the way the action splits it: on commas. */
function toolList(yml: string, flag: '--allowedTools' | '--disallowedTools'): string[] {
	const list = yml.match(new RegExp(`${flag} "([^"]+)"`))?.[1];
	assert.ok(list, `an explicit ${flag} list`);
	return list.split(',').map((tool) => tool.trim());
}

/**
 * The shell a workflow runs: every `run:` (and github-script `script:`) value,
 * inline or as a block scalar. An expression there is pasted into the script
 * before the shell parses it, so an issue body in one is code — the s1ngularity
 * injection. Through `env:` it stays a string (→ plan 25).
 */
function runBlocks(yml: string): string[] {
	const lines = yml.split('\n');
	const blocks: string[] = [];
	lines.forEach((line, index) => {
		const step = /^(\s*)(?:- )?(run|script):\s*(.*)$/.exec(line);
		if (!step) return;
		const [, indent, , rest] = step;
		if (!/^[|>][-+]?\s*$/.test(rest)) return void blocks.push(rest);
		const body: string[] = [];
		for (const next of lines.slice(index + 1)) {
			if (next.trim() && next.length - next.trimStart().length <= indent.length) break;
			body.push(next);
		}
		blocks.push(body.join('\n'));
	});
	return blocks;
}

/** An expression that pastes text someone outside the repository wrote. */
const UNTRUSTED =
	/\$\{\{[^}]*github\.event\.(issue|comment|pull_request|review|discussion)\.(body|title)/;

const AGENT_WORKFLOWS = ['triage.yml', 'build.yml'];

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

	it('runs in auto mode, and the deny list keeps the hard nos', () => {
		const build = workflow('build.yml');
		assert.ok(!/^\s+workflows:/m.test(build), 'no workflows permission');
		assert.ok(!/actions:\s*write/.test(build), 'no actions: write');
		assert.match(build, /^\s+--permission-mode auto$/m, 'auto mode (→ plan 25)');
		assert.ok(!build.includes('--allowedTools'), 'no allow-list beside auto mode');

		const denied = toolList(build, '--disallowedTools');
		for (const rule of [
			'WebFetch',
			'WebSearch',
			'Bash(gh api:*)',
			'Bash(gh workflow:*)',
			'Edit(.github/**)',
			'Write(.github/**)'
		]) {
			assert.ok(denied.includes(rule), `--disallowedTools names ${rule}`);
		}
		assert.ok(
			denied.some((rule) => rule.startsWith('Bash(gh pr merge') && rule.includes('--admin')),
			'an admin merge is denied'
		);
		for (const flag of ['--force', '-f']) {
			assert.ok(
				denied.some((rule) => rule.startsWith('Bash(git push') && rule.includes(flag)),
				`git push ${flag} is denied`
			);
		}
		assert.ok(
			!denied.some((rule) => rule.startsWith('Bash(gh pr merge --auto')),
			'auto-merge is not denied'
		);
	});

	it('merges only by auto-merge', () => {
		const prompt = readFileSync('.claude/commands/build-issue.md', 'utf8');
		const merges = [...prompt.matchAll(/gh pr merge[^`\n]*/g)].map((m) => m[0].trim());
		assert.ok(merges.length > 0, 'the prompt says how to merge');
		for (const merge of merges) {
			assert.ok(merge.startsWith('gh pr merge --auto'), `"${merge}" is the one merge command`);
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

describe('the agent lane (→ docs/plans/25-agent-evidence.md)', () => {
	it('pins a model in both agent jobs', () => {
		for (const name of AGENT_WORKFLOWS) {
			assert.match(workflow(name), /^\s+--model claude-[a-z]+-[\d-]+$/m, `${name} pins --model`);
		}
	});

	it('writes a run summary after both agents, even when they fail', () => {
		assert.ok(existsSync('scripts/agent-run-summary.ts'), 'the summary script exists');
		for (const name of AGENT_WORKFLOWS) {
			const yml = workflow(name);
			assert.match(
				yml,
				/uses: anthropics\/claude-code-action@v1\n\s+id: claude\n/,
				`${name}: the action has id: claude`
			);
			const step = yml.slice(yml.indexOf('- name: Run summary'));
			assert.ok(step.startsWith('- name: Run summary'), `${name} has a Run summary step`);
			assert.match(step, /^\s+if: always\(\)$/m, `${name}: the summary runs when the agent failed`);
			assert.ok(
				step.includes('${{ steps.claude.outputs.execution_file }}') &&
					step.includes('node scripts/agent-run-summary.ts "$EXECUTION_FILE"'),
				`${name}: the summary reads the action's execution file through env`
			);
		}
	});

	it('keeps triage off the web, writing only its comment draft to /tmp', () => {
		const triage = workflow('triage.yml');
		const allowed = toolList(triage, '--allowedTools');
		const denied = toolList(triage, '--disallowedTools');
		for (const tool of ['WebFetch', 'WebSearch']) {
			assert.ok(denied.includes(tool), `triage denies ${tool} (→ DECISIONS #163)`);
			assert.ok(!allowed.includes(tool), `triage does not allow ${tool}`);
		}
		assert.ok(
			!allowed.some((tool) => tool.includes('import:probe')),
			'the probe opens any URL too: build only'
		);
		const writes = allowed.filter((tool) => /^(Edit|Write|MultiEdit|NotebookEdit)\b/.test(tool));
		assert.deepEqual(writes, ['Edit(//tmp/**)'], 'the one writable place is /tmp');
		assert.match(triage, /contents: read/);
		assert.ok(!/contents: write/.test(triage), 'triage never writes the repository');
		assert.match(triage, /persist-credentials: false/, 'no token left in .git/config');
		const prompt = readFileSync('.claude/commands/triage-issue.md', 'utf8');
		assert.ok(prompt.includes('--body-file /tmp/'), 'triage posts its comment from a file');
		const build = readFileSync('.claude/commands/build-issue.md', 'utf8');
		assert.ok(build.includes('npm run import:probe'), 'build probes a linked page');
	});

	it('never pastes an issue’s body or title into a shell', () => {
		for (const file of sourceFiles('.github/workflows', ['.yml'])) {
			for (const block of runBlocks(file.text)) {
				assert.ok(
					!UNTRUSTED.test(block),
					`${file.path} interpolates untrusted text: ${block.trim()}`
				);
			}
		}
	});

	it('finds that interpolation inline, in a block, and leaves env alone', () => {
		const yml = [
			'    steps:',
			'      - run: echo "${{ github.event.issue.title }}"',
			'      - name: b',
			'        env:',
			'          BODY: ${{ github.event.issue.body }}',
			'        run: |',
			'          echo ok',
			'          echo "${{ github.event.issue.body }}"',
			'      - run: echo "$BODY"'
		].join('\n');
		const flagged = runBlocks(yml).filter((block) => UNTRUSTED.test(block));
		assert.equal(flagged.length, 2);
		assert.ok(!runBlocks(yml).some((block) => block.includes('BODY: ')));
	});
});
