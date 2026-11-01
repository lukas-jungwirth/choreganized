/**
 * The version floor CI holds (→ scripts/check-version.ts, DECISIONS #209).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	latestRelease,
	nextVersions,
	parseVersion,
	touchesApp,
	versionProblems
} from './check-version';

describe('parseVersion', () => {
	it('reads a plain X.Y.Z and nothing else', () => {
		assert.deepEqual(parseVersion('0.4.12'), [0, 4, 12]);
		assert.equal(parseVersion('0.4'), null);
		assert.equal(parseVersion('1.0.0-beta.1'), null);
		assert.equal(parseVersion('01.0.0'), null);
	});
});

describe('latestRelease', () => {
	it('picks the highest v-tag by number, not by spelling', () => {
		assert.deepEqual(latestRelease('v0.9.0\nv0.10.0\nv0.2.3\nsome-tag\nvnext'), [0, 10, 0]);
	});

	it('is null before the first release', () => {
		assert.equal(latestRelease(''), null);
	});
});

describe('nextVersions', () => {
	it('is the next patch, minor and major', () => {
		assert.deepEqual(nextVersions([0, 3, 2]), ['0.3.3', '0.4.0', '1.0.0']);
	});
});

describe('touchesApp', () => {
	it('counts source and static files, not tests, docs or tooling', () => {
		assert.equal(touchesApp(['src/routes/(app)/tasks/+page.svelte']), true);
		assert.equal(touchesApp(['static/manifest.webmanifest']), true);
		assert.equal(touchesApp(['src/lib/utils/dates.test.ts', 'docs/SPEC.md']), false);
		assert.equal(touchesApp(['scripts/release-pr.ts', '.github/workflows/ci.yml']), false);
	});
});

describe('versionProblems', () => {
	const release = [0, 3, 0] as const;
	const app = ['src/lib/server/services/tasks.ts'];
	const check = (version: string, changed: string[], lockVersion = version) =>
		versionProblems({ version, lockVersion, release: [...release], changed });

	it('refuses an app change that left the version at the release', () => {
		const [problem] = check('0.3.0', app);
		assert.match(problem, /changed since v0\.3\.0.*0\.3\.1 for a fix, 0\.4\.0 for a feature/);
	});

	it('lets docs and tests through without a bump', () => {
		assert.deepEqual(check('0.3.0', ['docs/SPEC.md', 'tests/e2e/tasks.spec.ts']), []);
	});

	it('takes any one step up: a fix, a feature, the 1.0', () => {
		for (const version of ['0.3.1', '0.4.0', '1.0.0']) assert.deepEqual(check(version, app), []);
	});

	it('refuses a skip and a step down', () => {
		assert.match(check('0.5.0', app)[0], /not one step above.*0\.3\.1, 0\.4\.0, 1\.0\.0/);
		assert.match(check('0.2.9', app)[0], /not one step above/);
	});

	it('wants package-lock.json to agree', () => {
		assert.match(check('0.4.0', app, '0.3.0')[0], /package-lock\.json says 0\.3\.0/);
	});

	it('refuses a version that is not X.Y.Z', () => {
		assert.match(check('0.4.0-rc.1', app)[0], /not a plain X\.Y\.Z/);
	});

	it('checks only the shape before the first release', () => {
		assert.deepEqual(
			versionProblems({ version: '0.1.0', lockVersion: '0.1.0', release: null, changed: app }),
			[]
		);
	});
});
