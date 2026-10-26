/**
 * Triage's verdict, applied (→ docs/plans/26-agent-reproduce-review.md, DECISIONS #164).
 *
 *   VERDICT=<json> ISSUE=<n> node scripts/triage-apply.ts
 *
 * The agent decides, the workflow acts. Triage returns its verdict as the action's
 * `structured_output` (shaped by `triage-verdict.schema.json`) and no longer edits the
 * issue itself; the `apply` job in triage.yml runs this with the job's own token to set
 * the labels and the title. Every label comes from an enum here, never from the agent's
 * text, so a steered verdict can't name a label that hands anything on. Whether a build
 * starts is not decided here either: that condition is the `Hand on` step's `if:` in
 * triage.yml, where a reviewer reads it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type Schema = {
	required: string[];
	properties: Record<string, { enum?: string[]; pattern?: string; maxLength?: number }>;
};
const schema = JSON.parse(
	readFileSync(new URL('./triage-verdict.schema.json', import.meta.url), 'utf8')
) as Schema;

const KINDS = ['bug', 'idea', 'duplicate'] as const;

export type Verdict = {
	kind: (typeof KINDS)[number];
	area: string;
	size: 's' | 'm' | 'l';
	confidence: 'found' | 'plausible' | 'cannot-tell' | 'not-a-bug';
	reproduced: boolean;
	open_questions: string[];
	fixed_on_dev_commit: string;
	title: string;
};

/**
 * The action already validated the output against the schema; this checks again,
 * because the labels below are built from these strings.
 */
export function parseVerdict(raw: string): Verdict {
	const value: unknown = JSON.parse(raw);
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('The verdict is not an object.');
	}
	const verdict = value as Record<string, unknown>;
	for (const key of Object.keys(verdict)) {
		if (!(key in schema.properties)) throw new Error(`The verdict has an unknown field "${key}".`);
	}
	for (const key of schema.required) {
		if (!(key in verdict)) throw new Error(`The verdict has no "${key}".`);
	}
	for (const [key, rule] of Object.entries(schema.properties)) {
		const field = verdict[key];
		if (rule.enum && !rule.enum.includes(field as string)) {
			throw new Error(`"${key}" is ${JSON.stringify(field)}, not one of ${rule.enum.join(', ')}.`);
		}
		if (rule.pattern && !new RegExp(rule.pattern).test(String(field))) {
			throw new Error(`"${key}" does not match ${rule.pattern}.`);
		}
	}
	if (typeof verdict.reproduced !== 'boolean') throw new Error('"reproduced" is not a boolean.');
	const questions = verdict.open_questions;
	if (!Array.isArray(questions) || questions.some((q) => typeof q !== 'string' || !q.trim())) {
		throw new Error('"open_questions" is not a list of questions.');
	}
	if (typeof verdict.title !== 'string' || !verdict.title.trim()) {
		throw new Error('"title" is empty.');
	}
	return verdict as Verdict;
}

const TITLE_MAX = schema.properties.title.maxLength ?? 70;
const PREFIX = { bug: 'Bug:', idea: 'Idea:' } as const;

/** One line, the app's `Bug:` / `Idea:` prefix, at most 70 characters. */
export function issueTitle(verdict: Verdict): string {
	let title = verdict.title.replace(/\s+/g, ' ').trim();
	if (verdict.kind !== 'duplicate') {
		const prefix = PREFIX[verdict.kind];
		if (!title.toLowerCase().startsWith(prefix.toLowerCase())) title = `${prefix} ${title}`;
	}
	return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title;
}

/**
 * What to add and remove so the issue carries exactly this verdict. A re-triage
 * (Actions → Triage → Run workflow) replaces the last one's kind, area and size.
 * `agent:build` is never touched here: only the hand-on step adds it.
 */
export function labelChanges(
	verdict: Verdict,
	current: string[]
): { add: string[]; remove: string[] } {
	const wanted =
		verdict.kind === 'duplicate'
			? ['duplicate']
			: [verdict.kind, `area:${verdict.area}`, `size:${verdict.size}`];
	if (verdict.kind === 'bug' && verdict.confidence === 'cannot-tell') wanted.push('needs-info');
	if (verdict.fixed_on_dev_commit) wanted.push('fixed-on-dev');

	const owned = (label: string) =>
		(KINDS as readonly string[]).includes(label) ||
		label.startsWith('area:') ||
		label.startsWith('size:') ||
		label === 'needs-info';
	return {
		add: wanted.filter((label) => !current.includes(label)),
		remove: current.filter((label) => owned(label) && !wanted.includes(label))
	};
}

function main() {
	const issue = process.env.ISSUE ?? '';
	if (!/^\d+$/.test(issue)) throw new Error(`ISSUE is "${issue}", not an issue number.`);
	const verdict = parseVerdict(process.env.VERDICT ?? '');

	const view = execFileSync('gh', ['issue', 'view', issue, '--json', 'labels'], {
		encoding: 'utf8'
	});
	const current = (JSON.parse(view) as { labels: { name: string }[] }).labels.map((l) => l.name);
	const { add, remove } = labelChanges(verdict, current);
	const title = issueTitle(verdict);

	const args = ['issue', 'edit', issue, '--title', title];
	if (add.length) args.push('--add-label', add.join(','));
	if (remove.length) args.push('--remove-label', remove.join(','));
	execFileSync('gh', args, { stdio: 'inherit' });

	console.log(
		[
			`#${issue}: ${verdict.kind} · area:${verdict.area} · size:${verdict.size}`,
			`confidence ${verdict.confidence} · reproduced ${verdict.reproduced}`,
			`${verdict.open_questions.length} open question(s)`,
			verdict.fixed_on_dev_commit ? `fixed on dev by ${verdict.fixed_on_dev_commit}` : '',
			`added: ${add.join(', ') || '—'} · removed: ${remove.join(', ') || '—'}`
		]
			.filter(Boolean)
			.join('\n')
	);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
