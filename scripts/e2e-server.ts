/**
 * The server Playwright tests against (→ playwright.config.ts, docs/TESTING.md).
 *
 * Starts `build/index.js` — the production build — on a throwaway database
 * under data/e2e/, wiped first so every run begins from migration zero. The
 * child's environment is built from scratch rather than inherited: the shell
 * this runs from may carry a real `GITHUB_FEEDBACK_TOKEN` or `DATABASE_PATH`,
 * and a test that files a GitHub issue or writes into somebody's household is
 * not a test. `E2E_MODE=true` is what lets the setup project sign up without
 * Google (→ src/lib/server/e2e-mode.ts).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const port = process.env.PORT ?? '4173';
const origin = `http://127.0.0.1:${port}`;
// One source for the path: playwright.config.ts passes what tests/e2e/accounts.ts
// exports, so the seed and the server can never disagree on the file.
const databasePath = process.env.E2E_DATABASE_PATH;

if (!databasePath) {
	console.error('e2e-server: E2E_DATABASE_PATH is not set — start this through `playwright test`.');
	process.exit(1);
}
if (!existsSync('build/index.js')) {
	console.error(
		'e2e-server: no build/index.js — run `npm run build` first (or `npm run test:e2e`).'
	);
	process.exit(1);
}

const dataDir = dirname(databasePath);
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const child = spawn(process.execPath, ['build/index.js'], {
	stdio: 'inherit',
	env: {
		PATH: process.env.PATH ?? '',
		HOME: process.env.HOME ?? '',
		TZ: 'Europe/Vienna',
		NODE_ENV: 'production',
		PORT: port,
		ORIGIN: origin,
		BETTER_AUTH_URL: origin,
		BETTER_AUTH_SECRET: 'e2e-only-not-a-real-secret-00000000000000',
		GOOGLE_CLIENT_ID: 'e2e-placeholder',
		GOOGLE_CLIENT_SECRET: 'e2e-placeholder',
		DATABASE_PATH: databasePath,
		UPLOADS_DIR: `${dataDir}/uploads`,
		BACKUPS_DIR: `${dataDir}/backups`,
		BODY_SIZE_LIMIT: '20M',
		// Push and the GitHub mirror stay off: no keys, no token.
		GITHUB_FEEDBACK_TOKEN: '',
		APP_VERSION: 'e2e',
		APP_COMMIT: process.env.GITHUB_SHA ?? '',
		E2E_MODE: 'true'
	}
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
