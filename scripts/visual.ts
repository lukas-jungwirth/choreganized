/**
 * `npm run test:visual [-- --update-snapshots]` — the visual project, in the
 * same container CI uses (→ docs/TESTING.md "Visual", DECISIONS #140).
 *
 * Screenshots are only comparable when the OS, the browser build and the font
 * rasteriser are the same, so the baselines are Linux-only and made inside
 * Microsoft's Playwright image at the exact version package-lock pins. This
 * script runs that image with the repo mounted and a cached, container-native
 * node_modules (the host's holds macOS binaries of better-sqlite3 and sharp).
 *
 * amd64 by default, even on Apple silicon, because that is what GitHub's
 * runners are; set VISUAL_PLATFORM=linux/arm64 for a faster local pass when
 * you only want to eyeball a diff, not commit a baseline.
 */
import { spawnSync } from 'node:child_process';
import { playwrightImage } from './playwright-image.ts';

const image = playwrightImage();
const platform = process.env.VISUAL_PLATFORM ?? 'linux/amd64';
const args = process.argv
	.slice(2)
	.map((arg) => JSON.stringify(arg))
	.join(' ');

// The build is plain JS with runtime env and no baked platform, so it is made
// here on the host — a Vite build under amd64 emulation is minutes — and the
// container only runs the browser against it.
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const inContainer = [
	// npm ci only when the lockfile moved: it wipes node_modules, which is a
	// minute of downloads every run otherwise.
	'if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then npm ci --no-audit --no-fund; fi',
	`npx playwright test --project=visual ${args}`
].join(' && ');

console.log(`visual: ${image} (${platform})`);
const result = spawnSync(
	'docker',
	[
		'run',
		'--rm',
		'--platform',
		platform,
		'-v',
		`${process.cwd()}:/work`,
		'-v',
		`choreganized-visual-node_modules-${platform.replace('/', '-')}:/work/node_modules`,
		'-w',
		'/work',
		'-e',
		'CI=1',
		'--ipc=host',
		image,
		'bash',
		'-lc',
		inContainer
	],
	{ stdio: 'inherit' }
);

if (result.error) {
	console.error(
		`visual: could not run docker (${result.error.message}). Install Docker Desktop, or push and let CI make the baselines (→ docs/TESTING.md).`
	);
	process.exit(1);
}
process.exit(result.status ?? 1);
