/**
 * Which build this is (→ plan 16, DECISIONS #137, #209).
 *
 * A feedback report has to say what the app was when somebody hit the bug.
 * "Which version was that on?" is a question nobody can answer an hour later, so
 * it is captured at submit time and carried on the row; Settings, `/api/health`
 * and the GitHub user-agent show the same label.
 *
 * **The version is `package.json`'s**, bundled into the server by the build — the
 * one place it is kept (→ docs/TESTING.md "Versions"). Each PR raises it, a merge
 * to `main` tags it. The dev server says `0.4.0-dev`: a developer running
 * `npm run dev` is not on a build, and the bare number would put a release on a
 * bug report that no deploy ever had.
 *
 * **The commit is baked at image build, never read from git.** `.dockerignore`
 * excludes `.git`, so the Dockerfile turns Coolify's `SOURCE_COMMIT` into
 * `APP_COMMIT` and this reads that.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import pkg from '../../../package.json' with { type: 'json' };

export type AppVersion = {
	/** The release, e.g. `0.4.0`, or `0.4.0-dev` on the dev server. */
	version: string;
	/** Short commit sha, or null when the build didn't carry one. */
	commit: string | null;
	/** What a human reads: `0.4.0+9f3c1a2`, `0.4.0`, or `0.4.0-dev`. */
	label: string;
};

/** Long enough to identify a commit, short enough to sit in a bullet. */
const SHA_CHARS = 7;

/**
 * Resolved per call, not at module scope: `$env/dynamic/private` is empty while
 * the app is building (→ `uploads.ts`). `APP_VERSION` overrides the number for
 * the test suites only — the Settings screenshot must not change with every
 * release — and is never set on a deploy.
 */
export function appVersion(): AppVersion {
	const version = env.APP_VERSION?.trim() || (dev ? `${pkg.version}-dev` : pkg.version);
	const commit = env.APP_COMMIT?.trim().slice(0, SHA_CHARS) || null;

	return { version, commit, label: commit ? `${version}+${commit}` : version };
}
