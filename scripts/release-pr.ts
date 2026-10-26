/**
 * The release PR: `dev → main`, kept current by .github/workflows/release.yml on every
 * push to `dev` (→ docs/TESTING.md "The flow", DECISIONS #161).
 *
 *   node scripts/release-pr.ts
 *
 * No agent opens a PR against `main`. Sessions and the build lane merge into `dev`;
 * this opens the one release PR when `dev` is ahead of `main`, or rewrites the body
 * of the one already open, so it always lists every PR since the last release and
 * carries a `Closes #N` per `fixed-on-dev` issue — closing keywords act only on the
 * default branch, so that line is what closes them. Lukas reads it, tries the test
 * environment, and merges. The code in the PR is `dev` itself and is always current;
 * the body is what a session used to forget.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const TITLE = 'Release: dev → main';

export type MergedPr = { number: number; title: string; author: string };
export type Issue = { number: number; title: string };

/**
 * PR numbers from `git log --first-parent --merges --format=%s main..dev`, newest first.
 * `Merge branch 'main' into dev` (an update-branch) is no PR and is skipped.
 */
export function prNumbers(log: string): number[] {
	return log
		.split('\n')
		.map((line) => /^Merge pull request #(\d+) from /.exec(line.trim())?.[1])
		.filter((n): n is string => n !== undefined)
		.map(Number);
}

export function releaseBody({
	prs,
	issues,
	otherCommits
}: {
	prs: MergedPr[];
	issues: Issue[];
	/** Commits on `dev`'s first-parent line that came in without a PR (an admin push). */
	otherCommits: number;
}): string {
	const lines = [
		'Everything on `dev` that is not on `main` yet. `.github/workflows/release.yml` rewrites this',
		'description on every push to `dev`; no agent opens a PR against `main`.',
		'',
		'Try it on the test environment, then merge — the household’s deploy follows `main`.',
		'If it shows `BEHIND`, `gh pr update-branch <this PR>` (→ docs/TESTING.md "The flow").',
		'',
		`## Pull requests (${prs.length})`,
		'',
		...(prs.length ? prs.map((pr) => `- #${pr.number} ${pr.title} (@${pr.author})`) : ['- none']),
		...(otherCommits
			? ['', `Plus ${otherCommits} commit${otherCommits === 1 ? '' : 's'} pushed without a PR.`]
			: [])
	];
	if (issues.length) {
		lines.push(
			'',
			'## Issues this closes (`fixed-on-dev`)',
			'',
			...issues.map((issue) => `Closes #${issue.number} — ${issue.title}`)
		);
	}
	return lines.join('\n') + '\n';
}

function run(command: string, args: string[]): string {
	return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function gh<T>(args: string[]): T {
	return JSON.parse(run('gh', args)) as T;
}

function main() {
	const range = 'origin/main..origin/dev';
	const ahead = Number(run('git', ['rev-list', '--count', range]));
	const open = gh<{ number: number }[]>([
		'pr',
		'list',
		'--base',
		'main',
		'--head',
		'dev',
		'--state',
		'open',
		'--json',
		'number'
	]);
	if (ahead === 0) {
		console.log('`dev` is not ahead of `main` — no release PR to write.');
		return;
	}

	const merges = run('git', ['log', '--first-parent', '--merges', '--format=%s', range]);
	const numbers = prNumbers(merges);
	const merged = gh<{ number: number; title: string; author: { login: string } }[]>([
		'pr',
		'list',
		'--base',
		'dev',
		'--state',
		'merged',
		'--limit',
		'200',
		'--json',
		'number,title,author'
	]);
	const byNumber = new Map(merged.map((pr) => [pr.number, pr]));
	const prs = numbers.map((number) => {
		const pr = byNumber.get(number);
		return { number, title: pr?.title ?? '(title not found)', author: pr?.author.login ?? '?' };
	});
	const firstParent = Number(run('git', ['rev-list', '--count', '--first-parent', range]));
	const updates = merges
		.split('\n')
		.filter((line) => line.startsWith("Merge branch 'main'")).length;
	const issues = gh<Issue[]>([
		'issue',
		'list',
		'--label',
		'fixed-on-dev',
		'--state',
		'open',
		'--limit',
		'100',
		'--json',
		'number,title'
	]);

	const file = 'release-pr-body.md';
	writeFileSync(
		file,
		releaseBody({ prs, issues, otherCommits: firstParent - numbers.length - updates })
	);
	if (open.length) {
		run('gh', ['pr', 'edit', String(open[0].number), '--title', TITLE, '--body-file', file]);
		console.log(
			`Updated release PR #${open[0].number}: ${prs.length} PRs, ${issues.length} issues.`
		);
	} else {
		console.log(
			run('gh', [
				'pr',
				'create',
				'--base',
				'main',
				'--head',
				'dev',
				'--title',
				TITLE,
				'--body-file',
				file
			])
		);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) main();
