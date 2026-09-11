/**
 * The two test accounts (→ tests/e2e/setup.ts). Each owns a seeded household
 * with identical demo content (→ scripts/seed.ts): `owner` is the one the e2e
 * journeys sign in as and mutate; `visual` is screenshotted and never touched.
 */
import {
	SEED_HOUSEHOLD_NAME,
	SEED_HOUSEMATE_NAME,
	SEED_ITEM_NAMES,
	SEED_RECIPE_NAMES,
	SEED_STORE_NAMES
} from '../../scripts/seed-data';

/**
 * The database the server under test opens — and the one the setup project
 * seeds. `playwright.config.ts` hands it to `scripts/e2e-server.ts`; with an
 * external server (`PLAYWRIGHT_BASE_URL`) set `E2E_DATABASE_PATH` to that
 * server's file, or the seed lands in the wrong one.
 */
export const DATABASE_PATH = process.env.E2E_DATABASE_PATH ?? 'data/e2e/choreganized.db';

export type Account = { key: 'owner' | 'visual'; name: string; email: string; password: string };

export const ACCOUNTS: Account[] = [
	{ key: 'owner', name: 'Lukas Test', email: 'owner@e2e.test', password: 'e2e-password-owner' },
	{ key: 'visual', name: 'Visual Test', email: 'visual@e2e.test', password: 'e2e-password-visual' }
];

export const storageStateFor = (key: Account['key']) => `tests/.auth/${key}.json`;

/** What the seed script gives every household (→ scripts/seed-data.ts). */
export const SEED = {
	householdName: SEED_HOUSEHOLD_NAME,
	housemate: SEED_HOUSEMATE_NAME,
	stores: SEED_STORE_NAMES,
	items: SEED_ITEM_NAMES,
	recipes: SEED_RECIPE_NAMES
};
