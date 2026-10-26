/**
 * `fixed-on-dev` on every issue a merged PR closes (→ .github/workflows/merged.yml,
 * docs/plans/26-agent-reproduce-review.md, DECISIONS #164).
 *
 *   BODY=<the PR's description> node scripts/fixed-on-dev.ts
 *
 * `Closes #N` only closes an issue when a PR merges into the default branch, and
 * everything merges into `dev` first — so the label is how `/inbox` and the release
 * PR know an issue is built. The build agent used to add it when its PR *opened*
 * (issue #31 carried it for a fix that never worked); now the workflow adds it when
 * the PR has merged, for agent and desk PRs alike.
 */
import { execFileSync } from 'node:child_process';

/**
 * Issue numbers after GitHub's closing keywords: `Closes #12`, `fixes: #3`,
 * `Resolved owner/repo#7` when `repo` is this repository. Another repository's
 * issue is not ours to label.
 */
export function closedIssues(body: string, repo: string): number[] {
	const numbers = new Set<number>();
	const keyword = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+([\w.-]+\/[\w.-]+)?#(\d+)\b/gi;
	for (const [, other, number] of body.matchAll(keyword)) {
		if (other && other.toLowerCase() !== repo.toLowerCase()) continue;
		numbers.add(Number(number));
	}
	return [...numbers];
}

function main() {
	const repo = process.env.GITHUB_REPOSITORY ?? '';
	const issues = closedIssues(process.env.BODY ?? '', repo);
	if (!issues.length) return console.log('This PR closes no issue.');
	let failed = 0;
	for (const issue of issues) {
		try {
			execFileSync('gh', ['issue', 'edit', String(issue), '--add-label', 'fixed-on-dev'], {
				stdio: 'inherit'
			});
			console.log(`#${issue}: fixed-on-dev`);
		} catch {
			// A `#N` that is a pull request, or gone. Say so; the others still get theirs.
			console.log(`::warning::#${issue} could not be labelled fixed-on-dev.`);
			failed++;
		}
	}
	if (failed === issues.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
