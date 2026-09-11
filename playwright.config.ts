/**
 * Playwright (→ docs/TESTING.md "End-to-end", "Visual").
 *
 * Runs against the **production build** — `node build/index.js`, the server
 * Coolify runs — not the Vite dev server, so adapter-node's body limit, the
 * baked env and the real migration path are all in the loop. `npm run test:e2e`
 * builds first; `scripts/e2e-server.ts` starts that build on its own database
 * under `data/e2e/` with `E2E_MODE=true`, which is what lets `tests/e2e/setup.ts`
 * sign up without Google (→ DECISIONS #139).
 *
 * Projects:
 *   setup   signs up the two test accounts, seeds a household for each, saves
 *           their cookies to tests/.auth
 *   e2e     user journeys, as the `owner` household — free to mutate it
 *   visual  screenshots of the `visual` household, which nothing mutates, so the
 *           two projects never race each other for the state of a screen.
 *           Linux-only baselines: see `tests/visual/screens.spec.ts`.
 *
 * Point `PLAYWRIGHT_BASE_URL` at a server you started yourself (any port) and no
 * server is launched; the setup project still signs up against it and seeds
 * `E2E_DATABASE_PATH`, so that server must run in E2E mode on that same file.
 */
import { defineConfig, devices } from '@playwright/test';
import { DATABASE_PATH } from './tests/e2e/accounts';

const PORT = 4173;
const externalServer = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalServer ?? `http://127.0.0.1:${PORT}`;

/** The design's frame: a 390px phone (→ CLAUDE.md "Mobile-first at 390px"). */
const phone = {
	...devices['Pixel 7'],
	viewport: { width: 390, height: 844 },
	// Playwright's mobile emulation also switches to a touch-only user agent;
	// the app doesn't branch on either, and the desktop `chromium` channel is
	// what the docker image and CI ship.
	defaultBrowserType: 'chromium' as const
};

export default defineConfig({
	testDir: 'tests',
	// The e2e household is shared by every e2e test, so they take turns.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	timeout: 30_000,
	expect: {
		timeout: 7_000,
		toHaveScreenshot: {
			// Same OS, same Chromium, same fonts — everything is self-hosted — so
			// the tolerance only has to absorb sub-pixel antialiasing. A count, not
			// a ratio: 0.2% of a 2.6× phone frame is ~4500 pixels, enough to let a
			// changed word through unseen.
			maxDiffPixels: 30,
			threshold: 0.2,
			animations: 'disabled',
			caret: 'hide'
		}
	},
	// One snapshot per screen, no platform suffix: baselines are made on Linux
	// (CI, or `npm run test:visual` in the same container) and nowhere else.
	snapshotPathTemplate: '{testDir}/visual/__screenshots__/{arg}{ext}',
	use: {
		baseURL,
		...phone,
		locale: 'en-GB',
		timezoneId: 'Europe/Vienna',
		colorScheme: 'light',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'setup', testMatch: /e2e\/setup\.ts/ },
		{
			name: 'e2e',
			testMatch: /e2e\/.*\.spec\.ts/,
			dependencies: ['setup'],
			// A journey can lose a race with the browser; a screenshot cannot.
			retries: process.env.CI ? 1 : 0,
			use: { storageState: 'tests/.auth/owner.json' }
		},
		{
			name: 'visual',
			testMatch: /visual\/.*\.spec\.ts/,
			dependencies: ['setup'],
			// Deterministic by construction: a retry could only repeat the diff.
			retries: 0,
			use: { storageState: 'tests/.auth/visual.json' }
		}
	],
	webServer: externalServer
		? undefined
		: {
				command: 'node scripts/e2e-server.ts',
				url: `${baseURL}/api/health`,
				timeout: 60_000,
				// Never adopt a stranger's server: it would not be in E2E mode, and
				// its database would be somebody's real one.
				reuseExistingServer: false,
				env: { PORT: String(PORT), E2E_DATABASE_PATH: DATABASE_PATH }
			}
});
