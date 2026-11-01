/**
 * Is `package.json`'s version right for what changed since the last release?
 * (→ docs/TESTING.md "Versions", DECISIONS #209)
 *
 *   npm run check:version
 *
 * `dev` always carries the version of the *next* release, and every PR raises it to
 * at least what its own change needs, measured against the newest `v*` tag (the last
 * release), not against `dev`. So the first feature after `v0.3.0` makes it `0.4.0`, and
 * a fix after that sees `0.4.0` already covers it. This is the floor CI can hold:
 *
 *   - the version is plain `X.Y.Z`, and package-lock.json says the same;
 *   - if app code changed since the tag, the version is above it;
 *   - and it is one step above it — the next patch, minor or major — never a skip.
 *
 * Whether a change is a fix (patch) or a feature (minor) only the author knows; the
 * release PR's title shows the result to Lukas before it ships. `1.0.0` is his call.
 * With no tag yet the floor is `0.0.0` and only the shape is checked.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export type Semver = [major: number, minor: number, patch: number];

export function parseVersion(text: string): Semver | null {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(text.trim());
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function formatVersion([major, minor, patch]: Semver): string {
	return `${major}.${minor}.${patch}`;
}

function compare(a: Semver, b: Semver): number {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The newest release among `git tag --list 'v*'`, or null when nothing was released yet. */
export function latestRelease(tags: string): Semver | null {
	return (
		tags
			.split('\n')
			.map((tag) => (tag.startsWith('v') ? parseVersion(tag.slice(1)) : null))
			.filter((version): version is Semver => version !== null)
			.sort(compare)
			.at(-1) ?? null
	);
}

/** The versions one step above a release: its next patch, minor and major. */
export function nextVersions([major, minor, patch]: Semver): string[] {
	return [
		formatVersion([major, minor, patch + 1]),
		formatVersion([major, minor + 1, 0]),
		formatVersion([major + 1, 0, 0])
	];
}

/**
 * What the household runs: the app's source and static files. Tests beside a module
 * and the repo's own tooling (scripts, workflows, docs) change nothing a user sees.
 */
export function touchesApp(files: string[]): boolean {
	return files.some(
		(file) => (file.startsWith('src/') && !file.endsWith('.test.ts')) || file.startsWith('static/')
	);
}

/** Every reason the version is wrong; empty when it is right. */
export function versionProblems({
	version,
	lockVersion,
	release,
	changed
}: {
	version: string;
	lockVersion: string;
	release: Semver | null;
	/** Files changed since the release tag. */
	changed: string[];
}): string[] {
	const parsed = parseVersion(version);
	if (!parsed) return [`package.json's version "${version}" is not a plain X.Y.Z.`];

	const problems: string[] = [];
	if (lockVersion !== version) {
		problems.push(
			`package-lock.json says ${lockVersion}, package.json ${version} — run \`npm install\`.`
		);
	}
	if (!release) return problems;

	const tag = `v${formatVersion(release)}`;
	const steps = nextVersions(release);
	if (compare(parsed, release) === 0) {
		if (touchesApp(changed)) {
			problems.push(
				`The app changed since ${tag} but the version is still ${version}. ` +
					`Raise it: ${steps[0]} for a fix, ${steps[1]} for a feature (→ docs/TESTING.md "Versions").`
			);
		}
	} else if (!steps.includes(version)) {
		problems.push(
			`${version} is not one step above the last release ${tag}: use ${steps.join(', ')}.`
		);
	}
	return problems;
}

function git(args: string[]): string {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function main() {
	const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
	const lockVersion = JSON.parse(readFileSync('package-lock.json', 'utf8')).version as string;
	const release = latestRelease(git(['tag', '--list', 'v*']));
	// Three dots: from where HEAD and the tag meet. The tag sits on `main`'s merge
	// commit, which `dev` never contains; their merge base is `dev` as it was released.
	const changed = release
		? git(['diff', '--name-only', `v${formatVersion(release)}...HEAD`])
				.split('\n')
				.filter(Boolean)
		: [];

	const problems = versionProblems({ version, lockVersion, release, changed });
	if (problems.length) {
		for (const problem of problems) console.error(`✗ ${problem}`);
		process.exit(1);
	}
	console.log(
		release
			? `✓ ${version} (last release v${formatVersion(release)})`
			: `✓ ${version} (nothing released yet — no tag to measure against)`
	);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
