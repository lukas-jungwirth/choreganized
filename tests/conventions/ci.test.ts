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
 *
 * And plan 26's lane rules (→ docs/plans/26-agent-reproduce-review.md, DECISIONS
 * #164): triage decides, the workflow acts — the conditions that start a build and
 * label an issue live in YAML, where this file can read them.
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

/**
 * One job of a workflow: from `  <name>:` to the next job at the same indent. There
 * is no YAML parser in the tree, and the jobs here are plain enough to slice.
 */
function job(yml: string, name: string): string {
	const start = yml.indexOf(`\n  ${name}:\n`);
	assert.ok(start >= 0, `a job named ${name}`);
	const next = yml.slice(start + 1).search(/\n {2}[\w-]+:\n/);
	return next < 0 ? yml.slice(start) : yml.slice(start, start + 1 + next);
}

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

	it('starts on a person’s label or a dispatch, never on a bot’s label', () => {
		const build = workflow('build.yml');
		const condition = build.slice(build.indexOf('    if: >-'), build.indexOf('    runs-on:'));
		for (const term of [
			"github.event_name == 'workflow_dispatch'",
			"github.event.label.name == 'agent:build'",
			"github.event.sender.type != 'Bot'"
		]) {
			assert.ok(condition.includes(term), `the job's if: names ${term}`);
		}
		assert.ok(
			!condition.includes('contains(github.event.issue.labels'),
			'no bot label path: the automatic one is triage’s dispatch (→ plan 26)'
		);
		assert.match(
			build,
			/^\s+allowed_bots: github-actions$/m,
			'the dispatch comes from the apply job'
		);
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
		assert.ok(
			job(workflow('triage.yml'), 'apply').includes('gh workflow run build.yml'),
			'triage’s apply job hands on'
		);
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

describe('the agent lane: reproduce first, review second (→ docs/plans/26-agent-reproduce-review.md)', () => {
	const SCHEMA = 'scripts/triage-verdict.schema.json';

	it('triage returns a verdict and no longer labels or retitles anything', () => {
		const triage = workflow('triage.yml');
		const allowed = toolList(triage, '--allowedTools');
		assert.ok(
			!allowed.some((tool) => tool.startsWith('Bash(gh issue edit')),
			'triage has no gh issue edit: the apply job labels'
		);
		assert.ok(allowed.includes('Bash(gh issue comment:*)'), 'triage still posts its comment');
		const agent = job(triage, 'triage');
		assert.ok(
			agent.includes('--add-dir ${{ runner.temp }}/probe'),
			'triage may read the probe report outside its checkout'
		);
		assert.ok(
			agent.includes("--json-schema '${{ steps.schema.outputs.json }}'"),
			'the action runs with --json-schema'
		);
		assert.ok(agent.includes(SCHEMA), 'the schema comes from the file triage-apply.ts reads');
		assert.match(
			agent,
			/outputs:\n\s+verdict: \$\{\{ steps\.claude\.outputs\.structured_output \}\}/,
			'the verdict is the job’s output'
		);
		const prompt = readFileSync('.claude/commands/triage-issue.md', 'utf8');
		assert.ok(!prompt.includes('gh issue edit'), 'the prompt never asks for gh issue edit');
	});

	it('the verdict schema names every field the lane reads, and fits in single quotes', () => {
		const text = readFileSync(SCHEMA, 'utf8');
		assert.ok(!text.includes("'"), `${SCHEMA} holds no apostrophe: it is passed in '…'`);
		const schema = JSON.parse(text) as { required: string[]; properties: Record<string, unknown> };
		const fields = [
			'kind',
			'area',
			'size',
			'confidence',
			'reproduced',
			'open_questions',
			'fixed_on_dev_commit',
			'title'
		];
		assert.deepEqual([...schema.required].sort(), [...fields].sort());
		assert.deepEqual(Object.keys(schema.properties).sort(), [...fields].sort());
	});

	it('the probe job reads linked pages with no agent and no secret but the job token', () => {
		const probe = job(workflow('triage.yml'), 'probe');
		assert.ok(!probe.includes('claude-code-action'), 'no agent in the probe job');
		const secrets = [...probe.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
		assert.deepEqual([...new Set(secrets)], ['GITHUB_TOKEN']);
		assert.ok(!/:\s*write/.test(probe), 'the probe job writes nothing');
		assert.ok(probe.includes('scripts/issue-probe.ts probe'), 'it probes');
		assert.match(job(workflow('triage.yml'), 'triage'), /needs: probe/);
	});

	it('the apply job labels from the verdict and dispatches only a small bug with a found cause', () => {
		const apply = job(workflow('triage.yml'), 'apply');
		assert.match(apply, /needs: triage/);
		assert.ok(!apply.includes('claude-code-action'), 'no agent in the apply job');
		assert.match(apply, /issues: write/);
		assert.match(apply, /actions: write/, 'a dispatch needs actions: write');
		assert.match(apply, /VERDICT: \$\{\{ needs\.triage\.outputs\.verdict \}\}/);
		assert.ok(apply.includes('node scripts/triage-apply.ts'), 'labels and title by the script');

		const step = apply.slice(apply.indexOf('- name: Hand on to the build'));
		const condition = step.slice(step.indexOf('if:'), step.indexOf('run:'));
		for (const term of [
			"fromJSON(env.VERDICT).kind == 'bug'",
			"fromJSON(env.VERDICT).size == 's'",
			"fromJSON(env.VERDICT).confidence == 'found'",
			"join(fromJSON(env.VERDICT).open_questions, '') == ''",
			"fromJSON(env.VERDICT).fixed_on_dev_commit == ''"
		]) {
			assert.ok(condition.includes(term), `the dispatch condition names ${term}`);
		}
		assert.ok(!condition.includes('||'), 'every term must hold');
		// Exactly these fields, no more and no fewer: `reproduced` is reported, not
		// required — the build's own reproduction is the check (→ DECISIONS #165).
		const fields = [...condition.matchAll(/fromJSON\(env\.VERDICT\)\.(\w+)/g)].map((m) => m[1]);
		assert.deepEqual(
			[...new Set(fields)].sort(),
			['confidence', 'fixed_on_dev_commit', 'kind', 'open_questions', 'size'],
			'the dispatch reads kind, size, confidence, open questions and fixed-on-dev'
		);
		assert.match(
			apply,
			/if: \$\{\{ !cancelled\(\) && needs\.triage\.result == 'success' \}\}/,
			'a failed probe never skips the labels'
		);
		assert.ok(step.includes("grep -qx 'agent:build'"), 'a re-triage never starts a second build');

		// The prompt predicts the dispatch so its comment can say why an issue waits; it
		// names the same terms, so a change to one shows up in the other.
		const prompt = readFileSync('.claude/commands/triage-issue.md', 'utf8');
		const rule = prompt.slice(prompt.indexOf('7. **Say where it goes next**'));
		for (const term of ['`bug`', '`size: s`', '`confidence: found`', '`open_questions`']) {
			assert.ok(rule.includes(term), `the prompt's hand-on rule names ${term}`);
		}
		assert.ok(step.includes('gh workflow run build.yml -f issue="$ISSUE"'), 'it dispatches');
	});

	it('an agent’s verdict never reaches a shell except through env', () => {
		for (const file of sourceFiles('.github/workflows', ['.yml'])) {
			for (const block of runBlocks(file.text)) {
				assert.ok(
					!/\$\{\{[^}]*(structured_output|outputs\.verdict)/.test(block),
					`${file.path} pastes the verdict into a script: ${block.trim()}`
				);
			}
		}
	});

	it('merged.yml labels fixed-on-dev on a merged PR into dev, and does nothing else', () => {
		const merged = workflow('merged.yml');
		const on = merged.slice(merged.indexOf('\non:'), merged.indexOf('\npermissions:'));
		assert.match(on, /pull_request:\n\s+types: \[closed\]\n\s+branches: \[dev\]/);
		for (const event of ['pull_request_target', 'push:', 'issues:', 'workflow_dispatch']) {
			assert.ok(!on.includes(event), `merged.yml must not fire on ${event}`);
		}
		assert.match(merged, /if: github\.event\.pull_request\.merged == true/);
		assert.match(merged, /^permissions: \{\}$/m, 'nothing by default');
		const writes = [...merged.matchAll(/^\s+([\w-]+): write$/gm)].map((m) => m[1]);
		assert.deepEqual(writes, ['issues'], 'it may only label');
		assert.ok(!merged.includes('claude-code-action'), 'no agent');
		assert.match(merged, /BODY: \$\{\{ github\.event\.pull_request\.body \}\}/, 'the body via env');
		assert.ok(merged.includes('node scripts/fixed-on-dev.ts'));
		const script = readFileSync('scripts/fixed-on-dev.ts', 'utf8');
		const ghCalls = [...script.matchAll(/execFileSync\('gh', \[([^\]]*)\]/g)].map((m) => m[1]);
		assert.deepEqual(ghCalls, ["'issue', 'edit', String(issue), '--add-label', 'fixed-on-dev'"]);
	});

	it('the build agent reproduces first, asks the reviewer, and leaves fixed-on-dev to merged.yml', () => {
		const prompt = readFileSync('.claude/commands/build-issue.md', 'utf8');
		assert.ok(prompt.includes('`Reproduce #$1: '), 'the first commit is "Reproduce #N: …"');
		assert.ok(prompt.includes('`reviewer`'), 'it names the reviewer subagent');
		assert.ok(prompt.includes('**Review**'), 'the PR body has a Review section');
		assert.ok(!prompt.includes('--add-label fixed-on-dev'), 'merged.yml labels, not the agent');
		assert.ok(prompt.includes('needs-info'), 'no reproduction, no fix on a guess');
	});

	it('the reviewer is a read-only Opus subagent', () => {
		const path = '.claude/agents/reviewer.md';
		assert.ok(existsSync(path), `${path} exists`);
		const front = readFileSync(path, 'utf8').split('---')[1] ?? '';
		assert.match(front, /^name: reviewer$/m);
		assert.match(front, /^model: opus$/m);
		const tools =
			/^tools: (.+)$/m
				.exec(front)?.[1]
				.split(',')
				.map((tool) => tool.trim()) ?? [];
		assert.deepEqual(tools, ['Read', 'Grep', 'Glob', 'Bash'], 'it reads, it does not write');
	});
});
