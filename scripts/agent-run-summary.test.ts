/**
 * The agent run's receipt (→ docs/plans/25-agent-evidence.md). The fixture is a
 * real recording, not a guessed shape: `claude -p --output-format stream-json`
 * (the same Agent SDK messages the action writes) in a throwaway package whose
 * `verify` fails once, with WebFetch left unlisted — the #31 refusal in
 * miniature. Cut at the result message, as the action cuts it; local paths
 * scrubbed. Its prose includes "SECRET-MESSAGE-TEXT", which must never surface.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { clip, parseExecutionFile, render, summarize } from './agent-run-summary';

const recorded = parseExecutionFile(
	readFileSync(new URL('./fixtures/agent-run.json', import.meta.url), 'utf8')
);

/** A minimal run around some tool calls, for the shapes one recording can't show. */
function run(
	calls: { id: string; command: string; result?: string; error?: boolean; background?: boolean }[]
) {
	return [
		{ type: 'system', subtype: 'init', model: 'claude-opus-5-5', permissionMode: 'auto' },
		...calls.flatMap((call) => [
			{
				type: 'assistant',
				message: {
					content: [
						{
							type: 'tool_use',
							id: call.id,
							name: 'Bash',
							input: { command: call.command, run_in_background: call.background }
						}
					]
				}
			},
			...(call.result === undefined
				? []
				: [
						{
							type: 'user',
							message: {
								content: [
									{
										type: 'tool_result',
										tool_use_id: call.id,
										content: call.result,
										is_error: call.error ?? false
									}
								]
							}
						}
					])
		])
	];
}

describe('summarize — the recorded run', () => {
	const summary = summarize(recorded);

	it('reads the model, turns, duration and cost', () => {
		assert.equal(summary.model, 'claude-haiku-5-5');
		assert.equal(summary.permissionMode, 'default');
		assert.equal(summary.outcome, 'success');
		assert.equal(summary.isError, false);
		assert.equal(summary.turns, 7);
		assert.equal(summary.durationMs, 16293);
		assert.ok(summary.costUsd !== null && summary.costUsd > 0);
	});

	it('lists the denied fetch, the tool and its input', () => {
		assert.deepEqual(summary.denials, [{ tool: 'WebFetch', input: 'https://example.com' }]);
	});

	it('lists each command once, and every verify with its exit code', () => {
		assert.deepEqual(summary.commands, [
			'npm run verify',
			'touch ok',
			'set -o pipefail && npm run verify 2>&1 | tail -5'
		]);
		assert.deepEqual(
			summary.verifies.map((v) => v.exitCode),
			[1, 0, 0]
		);
		assert.ok(summary.verifies.every((v) => !v.note));
	});

	it('counts a path rule’s refusal, which only the tool result reports', () => {
		const messages = [
			{
				type: 'assistant',
				message: {
					content: [
						{
							type: 'tool_use',
							id: 'w',
							name: 'Write',
							input: { file_path: '.github/workflows/build.yml' }
						}
					]
				}
			},
			{
				type: 'user',
				message: {
					content: [
						{
							type: 'tool_result',
							tool_use_id: 'w',
							is_error: true,
							content:
								'<tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>'
						}
					]
				}
			}
		];
		assert.deepEqual(summarize(messages).denials, [
			{ tool: 'Write', input: '.github/workflows/build.yml' }
		]);
	});

	it('still finds the denial when the run died before its result', () => {
		const died = summarize(recorded.filter((m) => m.type !== 'result'));
		assert.equal(died.outcome, null);
		assert.equal(died.isError, true);
		assert.deepEqual(died.denials, [{ tool: 'WebFetch', input: 'https://example.com' }]);
	});
});

describe('summarize — verify', () => {
	it('flags a pipe without pipefail: the exit code is tail’s', () => {
		const [verify] = summarize(
			run([{ id: 'a', command: 'npm run verify 2>&1 | tail -40', result: 'all green' }])
		).verifies;
		assert.equal(verify.exitCode, 0);
		assert.match(verify.note ?? '', /another command/);
	});

	it('flags whatever runs on regardless: ||, ; and a second line', () => {
		for (const command of [
			'npm run verify || true',
			'npm run verify; echo done',
			'npm run verify\necho done'
		]) {
			const [verify] = summarize(run([{ id: 'a', command, result: 'done' }])).verifies;
			assert.ok(verify.note, `${command} is flagged`);
		}
	});

	it('trusts &&, redirections, pipefail and output that mentions "denied"', () => {
		for (const command of [
			'cd app && npm run verify > verify.log 2>&1 && echo ok',
			'set -o pipefail && npm run verify 2>&1 | tail -60',
			'npm run verify'
		]) {
			const [verify] = summarize(
				run([{ id: 'a', command, result: '✓ a bot-added label is denied a build' }])
			).verifies;
			assert.deepEqual(verify, { command, exitCode: 0 });
		}
	});

	it('reads the code from "Exit code N"', () => {
		const [verify] = summarize(
			run([{ id: 'a', command: 'npm run verify', result: 'Exit code 2\n> verify', error: true }])
		).verifies;
		assert.equal(verify.exitCode, 2);
	});

	it('does not count a refused verify as run, nor as a command', () => {
		const messages = [
			...run([{ id: 'a', command: 'npm run verify', result: 'not granted', error: true }]),
			{
				type: 'result',
				subtype: 'success',
				permission_denials: [
					{ tool_name: 'Bash', tool_use_id: 'a', tool_input: { command: 'npm run verify' } }
				]
			}
		];
		const summary = summarize(messages);
		assert.deepEqual(summary.verifies, []);
		assert.deepEqual(summary.commands, []);
		assert.deepEqual(summary.denials, [{ tool: 'Bash', input: 'npm run verify' }]);
	});

	it('knows no code for a verify in the background or without a result', () => {
		const summary = summarize(
			run([
				{ id: 'a', command: 'npm run verify', background: true, result: 'started' },
				{ id: 'b', command: 'npm run verify' }
			])
		);
		assert.deepEqual(
			summary.verifies.map((v) => v.exitCode),
			[null, null]
		);
	});
});

describe('render', () => {
	const text = render(summarize(recorded), 'Triage');

	it('shows the model, the denial, the commands and the last verify', () => {
		assert.match(text, /^## Triage · agent run/);
		assert.match(text, /\| Model \| claude-haiku-5-5 \|/);
		assert.match(text, /- WebFetch: https:\/\/example\.com/);
		assert.match(text, /ran 3×; the last exited \*\*0\*\* — clean/);
		assert.match(text, /- touch ok/);
	});

	it('writes no message text, no thinking and no tool output', () => {
		const prose: string[] = [];
		for (const message of recorded) {
			const content = message.message?.content;
			for (const block of Array.isArray(content) ? content : []) {
				if (typeof block.text === 'string') prose.push(block.text);
				if (typeof block.thinking === 'string') prose.push(block.thinking);
				if (typeof block.content === 'string') prose.push(block.content);
			}
		}
		assert.ok(prose.length >= 8, 'the fixture carries prose to leak');
		assert.ok(!text.includes('SECRET-MESSAGE-TEXT'));
		for (const line of prose.flatMap((p) => p.split('\n'))) {
			if (line.trim().length >= 12) assert.ok(!text.includes(line.trim()), `leaked: ${line}`);
		}
		for (const output of ['1 failed', 'all green', 'haven’t granted', "haven't granted"]) {
			assert.ok(!text.includes(output), `leaked tool output: ${output}`);
		}
	});

	it('says plainly when verify never ran, or the run ended without a result', () => {
		const empty = render(summarize([]), 'Build');
		assert.match(empty, /never ran/);
		assert.match(empty, /\*\*no result\*\*/);
	});

	it('does not call a flagged verify clean', () => {
		const piped = render(
			summarize(run([{ id: 'a', command: 'npm run verify | tail', result: 'ok' }])),
			'Build'
		);
		assert.match(piped, /not shown clean/);
	});
});

describe('clip', () => {
	it('keeps one line, at most the given length', () => {
		assert.equal(clip('cat <<EOF\nhello\nEOF', 80), 'cat <<EOF ⏎ hello ⏎ EOF');
		assert.equal(clip('x'.repeat(130), 120).length, 120);
		assert.ok(clip('x'.repeat(130), 120).endsWith('…'));
	});
});

describe('parseExecutionFile', () => {
	it('reads the action’s JSON array and a stream-json log alike', () => {
		const lines = '{"type":"system","subtype":"init"}\n{"type":"result"}\n';
		assert.equal(parseExecutionFile(lines).length, 2);
		assert.equal(parseExecutionFile('[{"type":"result"}]').length, 1);
		assert.deepEqual(parseExecutionFile(''), []);
	});
});
