import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * What every Vitest run gets, whatever the shell or `.env` says. Vite's
 * `loadEnv` lets `process.env` win over every `.env*` file and still loads
 * `.env` under `test`, so `.env.test` alone cannot promise anything: a shell
 * with `DATABASE_PATH` exported would have `npm test` migrate a real database,
 * and a `.env` with a GitHub token would have the feedback tests file a real
 * issue. Set here, before the SvelteKit plugin reads the environment, these
 * are what `$env/dynamic/private` resolves to — and `tests/helpers/db.ts`
 * refuses to run against anything but `:memory:` (→ docs/TESTING.md).
 */
const TEST_ENV = {
	DATABASE_PATH: ':memory:',
	UPLOADS_DIR: './data/test-uploads',
	BACKUPS_DIR: './data/test-backups',
	GITHUB_FEEDBACK_TOKEN: '',
	PUBLIC_VAPID_PUBLIC_KEY: '',
	VAPID_PRIVATE_KEY: '',
	E2E_MODE: ''
};

export default defineConfig(({ mode }) => {
	if (mode === 'test') Object.assign(process.env, TEST_ENV);

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// Single-process Node deploy (Coolify): needs a long-running server for
				// node-cron and web-push, so adapter-node rather than adapter-auto.
				adapter: adapter()
			})
		],

		/**
		 * Vitest (→ docs/TESTING.md). Running it through the SvelteKit plugin is what
		 * makes `$lib`, `$app/environment` and `$env/dynamic/private` resolve, so a
		 * service can be tested against a real (in-memory) database rather than only
		 * the pure utils. `.env.test` supplies the harmless stand-ins; `TEST_ENV`
		 * above forces the ones that must never be real.
		 *
		 * Three kinds of test, one runner:
		 *   src/**\/*.test.ts         unit — pure functions beside the module they pin
		 *   tests/integration/**     services against a migrated in-memory SQLite
		 *   tests/conventions/**     the house rules from CLAUDE.md, as failing tests
		 * Playwright (tests/e2e, tests/visual) is deliberately not here.
		 */
		test: {
			include: [
				'src/**/*.test.ts',
				'tests/integration/**/*.test.ts',
				'tests/conventions/**/*.test.ts'
			],
			// Vitest's default, spelled out because the fixture depends on it: one
			// module graph per file means one fresh database per file.
			isolate: true
		}
	};
});
