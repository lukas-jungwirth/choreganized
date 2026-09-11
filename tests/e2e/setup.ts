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
import { expect, request, test as setup } from '@playwright/test';
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
		await api.dispose();

		const seed = spawnSync(process.execPath, ['scripts/seed.ts', account.email], {
			encoding: 'utf8',
			env: { ...process.env, DATABASE_PATH }
		});
		expect(seed.status, `seed for ${account.email}:\n${seed.stdout}${seed.stderr}`).toBe(0);
	}
});
