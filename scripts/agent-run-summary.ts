/**
 * The receipt for one agent run (→ docs/plans/25-agent-evidence.md).
 *
 *   node scripts/agent-run-summary.ts <execution-file> --title Build
 *
 * claude-code-action hides the transcript — rightly, the repository is public —
 * so a run that ticked "`npm run verify` clean" or guessed at a page it was
 * refused could not be checked afterwards (issue #31: 2 silent denials in
 * triage, 9 in build). This reads the action's execution file (the Agent SDK's
 * messages, as a JSON array) and appends a summary to `$GITHUB_STEP_SUMMARY`:
 * the model, turns, duration and cost; every denied tool call; every Bash
 * command, de-duplicated; and every `npm run verify` with its exit code.
 *
 * **It writes no message text and no transcript** — no assistant prose, no tool
 * output, no thinking: only tool names, clipped tool inputs and numbers. A run
 * that died before writing the file gets a line saying so, and the step still
 * passes; it is evidence, not a gate.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** How much of a denied call's input, and of a command, the summary keeps. */
const DENIAL_INPUT_CHARS = 80;
const COMMAND_CHARS = 120;
/** `npm run verify` as a command: at the start, or after `&&`, `||`, `;`, `|`, `(` or a newline. */
const VERIFY = /(?:^|[;&|(\n])\s*npm run verify\b/;
/** How Claude Code words a refusal in the tool result — never how a command's output starts. */
const REFUSED =
	/^(<tool_use_error>)?(Permission to use .* has been denied|Claude requested permissions to use .* but you haven't granted it|.*denied by your permission settings)/;

export type RunSummary = {
	model: string | null;
	permissionMode: string | null;
	/** The result's subtype (`success`, `error_max_turns`, …) — null when the run never finished. */
	outcome: string | null;
	isError: boolean;
	turns: number | null;
	durationMs: number | null;
	costUsd: number | null;
	denials: { tool: string; input: string }[];
	commands: string[];
	/** Every `npm run verify`, in order: null when its exit code can't be known. */
	verifies: { command: string; exitCode: number | null; note?: string }[];
};

type Block = {
	type?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	tool_use_id?: string;
	content?: unknown;
	is_error?: boolean;
};
type Message = {
	type?: string;
	subtype?: string;
	model?: string;
	permissionMode?: string;
	message?: { content?: unknown };
	tool_name?: string;
	tool_use_id?: string;
	tool_input?: unknown;
	permission_denials?: { tool_name?: string; tool_use_id?: string; tool_input?: unknown }[];
	is_error?: boolean;
	num_turns?: number;
	duration_ms?: number;
	total_cost_usd?: number;
};

/** One line, at most `max` characters — newlines shown, never kept. */
export function clip(text: string, max: number): string {
	const line = text
		.replace(/\s*\n\s*/g, ' ⏎ ')
		.replace(/\s+/g, ' ')
		.trim();
	return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** The part of a tool call's input that says what it was for. */
function describeInput(input: unknown): string {
	if (!input || typeof input !== 'object') return '';
	const fields = input as Record<string, unknown>;
	for (const key of ['command', 'url', 'file_path', 'path', 'pattern', 'query', 'skill']) {
		if (typeof fields[key] === 'string') return fields[key];
	}
	return JSON.stringify(input);
}

function blocks(message: Message): Block[] {
	const content = message.message?.content;
	return Array.isArray(content) ? (content as Block[]) : [];
}

function resultText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n');
}

/**
 * The command as the shell runs it, with the text it only carries blanked out:
 * quoted strings and heredoc bodies. Issue #48's triage put "npm run verify
 * clean" in a comment's `--body`, and the summary counted a verify that never
 * ran. A quoted string shrinks to its two quote marks, so it still reads as one
 * argument and never as a command.
 */
export function shellOnly(command: string): string {
	return command
		.replace(
			/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g,
			(heredoc) => heredoc.split('\n')[0]
		)
		.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, (quoted) => `${quoted[0]}${quoted.at(-1)}`);
}

/** Whether a command runs `npm run verify` — not merely mentions it. */
export function runsVerify(command: string): boolean {
	return VERIFY.test(shellOnly(command));
}

/**
 * A Bash result's exit code. Claude Code marks a non-zero exit `is_error` and
 * opens the output with "Exit code N". That is verify's own code only when
 * nothing after it can replace it: `&&` and redirections keep it, but a pipe
 * without `pipefail` reports the last command's, and `||`, `;` or a second line
 * run on regardless — `npm run verify || true` always exits 0. Those are
 * flagged rather than trusted.
 */
function exitCodeOf(command: string, result: Block | undefined): RunSummary['verifies'][number] {
	const clipped = clip(command, COMMAND_CHARS);
	if (!result) return { command: clipped, exitCode: null, note: 'no result — the run ended' };

	const text = resultText(result.content);
	const exitCode = result.is_error ? Number(/^Exit code (\d+)/.exec(text)?.[1] ?? 1) : 0;
	const shell = shellOnly(command);
	const after = shell.slice(shell.search(VERIFY)).replace(/^[\s\S]*?npm run verify/, '');
	const piped = /(?<!\|)\|(?!\|)/.test(after) && !/pipefail/.test(command);
	if (piped || /\|\||;|\n/.test(after)) {
		return { command: clipped, exitCode, note: 'another command decides this exit code' };
	}
	return { command: clipped, exitCode };
}

export function summarize(messages: Message[]): RunSummary {
	const init = messages.find((m) => m.type === 'system' && m.subtype === 'init');
	const result = messages.find((m) => m.type === 'result');

	const calls: Block[] = [];
	const results = new Map<string, Block>();
	for (const message of messages) {
		for (const block of blocks(message)) {
			if (message.type === 'assistant' && block.type === 'tool_use' && block.id) calls.push(block);
			if (message.type === 'user' && block.type === 'tool_result' && block.tool_use_id) {
				results.set(block.tool_use_id, block);
			}
		}
	}

	// Three sources, merged by call id: the result's list; the moment-of-refusal
	// messages, which still count when the run died before it; and the refusals
	// neither lists — a path rule such as `Write(.github/**)` comes back only as
	// an error result ("…denied by your permission settings").
	const denied = new Map<string, { tool: string; input: string }>();
	const deny = (id: string | undefined, tool: string | undefined, input: unknown) => {
		if (!tool) return;
		const call = id ? calls.find((c) => c.id === id) : undefined;
		denied.set(id ?? `#${denied.size}`, {
			tool,
			input: clip(describeInput(input ?? call?.input), DENIAL_INPUT_CHARS)
		});
	};
	for (const message of messages) {
		if (message.type === 'system' && message.subtype === 'permission_denied') {
			deny(message.tool_use_id, message.tool_name, message.tool_input);
		}
	}
	for (const denial of result?.permission_denials ?? []) {
		deny(denial.tool_use_id, denial.tool_name, denial.tool_input);
	}
	for (const call of calls) {
		const answer = results.get(call.id!);
		const firstLine = answer?.is_error ? resultText(answer.content).split('\n')[0] : '';
		if (REFUSED.test(firstLine)) deny(call.id, call.name, call.input);
	}

	// What ran: a refused call never did, so it is a denial, not a command.
	const commands = new Set<string>();
	const verifies: RunSummary['verifies'] = [];
	for (const call of calls) {
		const command = call.input?.command;
		if (call.name !== 'Bash' || typeof command !== 'string' || denied.has(call.id!)) continue;
		commands.add(clip(command, COMMAND_CHARS));
		if (!runsVerify(command)) continue;
		verifies.push(
			call.input?.run_in_background
				? { command: clip(command, COMMAND_CHARS), exitCode: null, note: 'in the background' }
				: exitCodeOf(command, results.get(call.id!))
		);
	}

	return {
		model: init?.model ?? null,
		permissionMode: init?.permissionMode ?? null,
		outcome: result?.subtype ?? null,
		isError: result ? Boolean(result.is_error) : true,
		turns: result?.num_turns ?? null,
		durationMs: result?.duration_ms ?? null,
		costUsd: result?.total_cost_usd ?? null,
		denials: [...denied.values()],
		commands: [...commands],
		verifies
	};
}

/** A fenced block whose lines can't close it: every line starts with "- " or a tool name. */
const fence = (lines: string[]) => ['```text', ...lines, '```'].join('\n');

function minutes(ms: number): string {
	const seconds = Math.round(ms / 1000);
	return seconds < 120 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

export function render(summary: RunSummary, title: string): string {
	const out = [`## ${title} · agent run`, ''];

	const outcome =
		summary.outcome === null
			? '**no result** — the run ended before Claude Code reported one'
			: `${summary.outcome}${summary.isError ? ' (error)' : ''}`;
	out.push(
		'| | |',
		'| --- | --- |',
		`| Model | ${summary.model ?? 'unknown'} |`,
		`| Permission mode | ${summary.permissionMode ?? 'unknown'} |`,
		`| Outcome | ${outcome} |`,
		`| Turns | ${summary.turns ?? '—'} |`,
		`| Duration | ${summary.durationMs === null ? '—' : minutes(summary.durationMs)} |`,
		`| Cost | ${summary.costUsd === null ? '—' : `$${summary.costUsd.toFixed(2)}`} |`,
		''
	);

	const last = summary.verifies.at(-1);
	if (!last) {
		out.push('**`npm run verify`** never ran.');
	} else {
		const code = last.exitCode === null ? 'unknown' : String(last.exitCode);
		const verdict = last.exitCode === 0 && !last.note ? 'clean' : 'not shown clean';
		out.push(
			`**\`npm run verify\`** ran ${summary.verifies.length}×; the last exited **${code}** — ${verdict}.`,
			'',
			fence(
				summary.verifies.map(
					(run) =>
						`- exit ${run.exitCode ?? '?'}${run.note ? ` (${run.note})` : ''}: ${run.command}`
				)
			)
		);
	}
	out.push('');

	out.push(`**Denied tool calls: ${summary.denials.length}**`);
	if (summary.denials.length) {
		out.push('', fence(summary.denials.map((d) => `- ${d.tool}: ${d.input}`)));
	}
	out.push('');

	out.push(`**Bash commands: ${summary.commands.length}** (de-duplicated)`);
	if (summary.commands.length) out.push('', fence(summary.commands.map((c) => `- ${c}`)));

	return `${out.join('\n')}\n`;
}

/** The execution file is a JSON array; a JSONL stream (`claude -p --output-format stream-json`) reads too. */
export function parseExecutionFile(text: string): Message[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith('[')) return JSON.parse(trimmed) as Message[];
	return trimmed.split('\n').map((line) => JSON.parse(line) as Message);
}

function main(argv: string[]) {
	const titleAt = argv.indexOf('--title');
	const title = titleAt >= 0 ? (argv[titleAt + 1] ?? 'Agent') : 'Agent';
	const given = argv.find(
		(arg, index) => !arg.startsWith('--') && (titleAt < 0 || index !== titleAt + 1)
	);
	// The action sets its `execution_file` output only when the file exists; the
	// path itself is fixed, so look there too.
	const runnerTemp = process.env.RUNNER_TEMP;
	const file = given || (runnerTemp ? join(runnerTemp, 'claude-execution-output.json') : undefined);

	const text =
		file && existsSync(file)
			? render(summarize(parseExecutionFile(readFileSync(file, 'utf8'))), title)
			: `## ${title} · agent run\n\nNo execution file — the action stopped before Claude Code ran.\n`;

	const target = process.env.GITHUB_STEP_SUMMARY;
	if (target) appendFileSync(target, text);
	else process.stdout.write(text);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
