/**
 * The retry that looks for an issue it may already have filed searches the
 * **body** for the app's marker, never the title — so triage may retitle an
 * issue (→ plan 25) and the second sync of the same report still finds it.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { GITHUB_FEEDBACK_TOKEN: 'test-token', GITHUB_FEEDBACK_REPO: 'owner/repo' }
}));

const { findIssueByMarker } = await import('./github');

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('findIssueByMarker', () => {
	it('searches the body for the marker, so a new title does not lose the issue', async () => {
		const urls: string[] = [];
		vi.stubGlobal('fetch', async (url: string | URL) => {
			urls.push(String(url));
			return Response.json({
				items: [{ number: 31, html_url: 'https://github.com/owner/repo/issues/31' }]
			});
		});

		const found = await findIssueByMarker('choreganized:abc');

		assert.deepEqual(found, { number: 31, url: 'https://github.com/owner/repo/issues/31' });
		const query = new URL(urls[0]).searchParams.get('q');
		assert.equal(query, 'repo:owner/repo in:body "choreganized:abc"');
	});
});
