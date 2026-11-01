/**
 * The release PR's description (→ scripts/release-pr.ts). The log lines are the real
 * subjects GitHub writes for a merge button and an update-branch.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { prNumbers, releaseBody, releaseTitle } from './release-pr';

describe('prNumbers', () => {
	it('reads merged PRs and skips a merge of main back into dev', () => {
		const log = [
			'Merge pull request #46 from lukas-jungwirth/plan-import-ai-repair',
			"Merge branch 'main' into dev",
			'Merge pull request #13 from lukas-jungwirth/agent/issue-7',
			'Merge branch dev into main: something'
		].join('\n');
		assert.deepEqual(prNumbers(log), [46, 13]);
	});

	it('is empty for an empty range', () => {
		assert.deepEqual(prNumbers(''), []);
	});
});

describe('releaseBody', () => {
	const prs = [
		{ number: 46, title: 'Plan 28: AI repairs bad recipe cards', author: 'lukas-jungwirth' },
		{ number: 13, title: 'Fix the snooze label', author: 'claude' }
	];
	const next = { version: '0.4.0', lastRelease: '0.3.0' };

	it('lists every PR and closes every fixed-on-dev issue', () => {
		const body = releaseBody({
			...next,
			prs,
			issues: [{ number: 7, title: 'Snooze says tomorrow' }],
			otherCommits: 0
		});
		assert.match(body, /## Pull requests \(2\)/);
		assert.match(body, /^- #46 Plan 28: AI repairs bad recipe cards \(@lukas-jungwirth\)$/m);
		assert.match(body, /^- #13 Fix the snooze label \(@claude\)$/m);
		// A closing keyword at the start of its own line, or GitHub doesn't act on it.
		assert.match(body, /^Closes #7 — Snooze says tomorrow$/m);
		assert.doesNotMatch(body, /pushed without a PR/);
	});

	it('leaves out the issues section when nothing waits on the release', () => {
		const body = releaseBody({ ...next, prs, issues: [], otherCommits: 0 });
		assert.doesNotMatch(body, /Closes/);
	});

	it('says when commits came in without a PR', () => {
		assert.match(
			releaseBody({ ...next, prs, issues: [], otherCommits: 1 }),
			/Plus 1 commit pushed/
		);
		assert.match(
			releaseBody({ ...next, prs: [], issues: [], otherCommits: 3 }),
			/- none[\s\S]*Plus 3 commits/
		);
	});

	it('names the version the merge tags, and the release before it', () => {
		const body = releaseBody({ ...next, prs, issues: [], otherCommits: 0 });
		assert.match(body, /Merging tags \*\*v0\.4\.0\*\*.*\(last release v0\.3\.0\)/);
		assert.match(
			releaseBody({ version: '0.1.0', lastRelease: null, prs, issues: [], otherCommits: 0 }),
			/Merging tags \*\*v0\.1\.0\*\*.*the first one/
		);
	});

	it('warns when dev never left the last release', () => {
		const body = releaseBody({
			version: '0.3.0',
			lastRelease: '0.3.0',
			prs,
			issues: [],
			otherCommits: 0
		});
		assert.match(body, /No new version.*still at v0\.3\.0/);
	});
});

describe('releaseTitle', () => {
	it('carries the version', () => {
		assert.equal(releaseTitle('0.4.0'), 'Release v0.4.0: dev → main');
	});
});
