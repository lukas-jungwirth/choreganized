/**
 * Which build this is (→ plan 16, DECISIONS #136).
 *
 * There is exactly one reader: a feedback report, which has to say what the app
 * was when somebody hit the bug. "Which version was that on?" is a question
 * nobody can answer an hour later, so it is captured at submit time and carried
 * on the row.
 *
 * **Baked at image build, never read from git.** `.dockerignore` excludes
 * `.git`, so there is no repository in the container to ask — the Dockerfile
 * turns its build args into `APP_VERSION` / `APP_COMMIT` and this reads those.
 * In dev both are unset and the answer is honestly `dev`: a developer running
 * `npm run dev` is not on a build, and inventing a number for them would put a
 * version on a bug report that no deploy ever had.
 */
import { env } from '$env/dynamic/private';

export type AppVersion = {
	/** The release, e.g. `1.0.0`, or `dev` when nothing was baked in. */
	version: string;
	/** Short commit sha, or null when the build didn't carry one. */
	commit: string | null;
	/** What a human reads: `1.0.0+9f3c1a2`, `1.0.0`, or `dev`. */
	label: string;
};

/** Long enough to identify a commit, short enough to sit in a bullet. */
const SHA_CHARS = 7;

/**
 * Resolved per call, not at module scope: `$env/dynamic/private` is empty while
 * the app is building (→ `uploads.ts`), so a module-level constant would ship
 * as `undefined` and every report would claim to be `dev`.
 */
export function appVersion(): AppVersion {
	const version = env.APP_VERSION?.trim() || 'dev';
	const commit = env.APP_COMMIT?.trim().slice(0, SHA_CHARS) || null;

	return { version, commit, label: commit ? `${version}+${commit}` : version };
}
