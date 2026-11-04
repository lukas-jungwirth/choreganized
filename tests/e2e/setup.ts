/**
 * Project `setup` (→ playwright.config.ts): mint the sessions, seed the data.
 *
 * Sign-up goes through Better Auth's own endpoint — `E2E_MODE=true` is what
 * enables it — so the cookie the tests carry is exactly the one the app would
 * have set (→ DECISIONS #139). The seed is the repo's own `scripts/seed.ts`,
 * run as a child process against the e2e database: same demo household a
 * developer looks at, idempotent, bound to the user by email.
 */
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { expect, request, test as setup, type APIRequestContext } from '@playwright/test';
import { SEED_TIMEZONE } from '../../scripts/seed-data';
import { todayIn } from '../../src/lib/utils/dates';
import { closureAhead } from '../../src/lib/utils/holidays';
import { ACCOUNTS, DATABASE_PATH, storageStateFor } from './accounts';

setup('sign up the test accounts and seed their households', async ({ baseURL }) => {
	for (const account of ACCOUNTS) {
		const api = await request.newContext({ baseURL });

		const signUp = await api.post('/api/auth/sign-up/email', {
			data: { name: account.name, email: account.email, password: account.password }
		});
		if (!signUp.ok()) {
			// A server that survived from a previous run already knows this account.
			const signIn = await api.post('/api/auth/sign-in/email', {
				data: { email: account.email, password: account.password }
			});
			expect(signIn.ok(), `sign-in for ${account.email}: ${await signIn.text()}`).toBe(true);
		}

		await api.storageState({ path: storageStateFor(account.key) });

		const seed = spawnSync(process.execPath, ['scripts/seed.ts', account.email], {
			encoding: 'utf8',
			env: { ...process.env, DATABASE_PATH }
		});
		expect(seed.status, `seed for ${account.email}:\n${seed.stdout}${seed.stderr}`).toBe(0);

		if (account.key === 'visual') await answerClosureNotice(api, baseURL!);
		// The very first look at Home is the welcome raccoon for that whole slot
		// (→ DECISIONS #238). Take it at the household's midnight, a slot of its
		// own, so the afternoon every journey and screenshot sees is an ordinary one.
		withTimezone(account.email, 'Pacific/Auckland');
		expect((await api.get('/home')).ok()).toBe(true);
		withTimezone(account.email, SEED_TIMEZONE);
		// Meet today's Home raccoon once and open the album once (→ plan 35), so
		// the "New raccoon!" toast and the "New" badges are behind both accounts
		// before any journey or screenshot: the first look is the only one that
		// differs, and which test got it would depend on the order they ran in.
		expect((await api.get('/home')).ok()).toBe(true);
		expect((await api.get('/settings/raccoons')).ok()).toBe(true);
		await api.dispose();
	}
});

/** Moves the household `email` belongs to into `timezone` — its clock, not its data. */
function withTimezone(email: string, timezone: string): void {
	const db = new Database(DATABASE_PATH);
	try {
		db.prepare(
			`update households set timezone = ? where id in (
				select m.household_id from members m join user u on u.id = m.user_id where u.email = ?
			)`
		).run(timezone, email);
	} finally {
		db.close();
	}
}

/**
 * The shop-closure banner (→ SPEC §3.6) sits on Home and Shopping for the three
 * days before a holiday, so a screenshot taken then differed from the
 * baselines: every PR from 24 October failed on National Day. The visual
 * household answers "Got it" to whatever closure is in view, the way a member
 * would, so those screens no longer depend on the date (→ DECISIONS #153). The
 * banner itself is the unit tests' (`utils/holidays.test.ts`).
 */
async function answerClosureNotice(api: APIRequestContext, baseURL: string): Promise<void> {
	const closure = closureAhead(todayIn(SEED_TIMEZONE));
	if (!closure) return;

	const answered = await api.post('/home?/holidayNotice', {
		headers: { origin: baseURL, 'x-sveltekit-action': 'true' },
		form: { closureDate: closure.closureDate, answer: 'dismiss' }
	});
	// The action's data is devalue-encoded: `[{ holidayAnswered: 1 }, true]`.
	const [, written] = JSON.parse((await answered.json()).data);
	expect(written, `dismissing the ${closure.closureDate} closure notice`).toBe(true);
}
