/**
 * Which issues a merged PR closes (→ scripts/fixed-on-dev.ts, merged.yml). The
 * keywords are GitHub's own list.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { closedIssues } from './fixed-on-dev';

const repo = 'lukas-jungwirth/choreganized';

describe('closedIssues', () => {
	it('reads every closing keyword GitHub knows, in any case', () => {
		const body = [
			'Closes #31',
			'fixes #7, resolves #9',
			'Fixed: #12 and RESOLVED #13; close #14 — closed #15, fix #16, resolve #17'
		].join('\n');
		assert.deepEqual(closedIssues(body, repo), [31, 7, 9, 12, 13, 14, 15, 16, 17]);
	});

	it('takes this repository’s full form and skips another one’s issue', () => {
		assert.deepEqual(
			closedIssues('Closes lukas-jungwirth/choreganized#4\nCloses someone/else#5', repo),
			[4]
		);
	});

	it('ignores a mention that closes nothing, and counts an issue once', () => {
		assert.deepEqual(closedIssues('Follow-up to #48 (see #50). Disclosed #3.', repo), []);
		assert.deepEqual(closedIssues('Closes #8\nCloses #8', repo), [8]);
	});
});
