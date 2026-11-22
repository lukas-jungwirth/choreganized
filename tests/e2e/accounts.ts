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
	SEED_CHECKLIST_ITEMS,
	SEED_CHECKLIST_NAME,
	SEED_STORE_NAMES
} from '../../scripts/seed-data';

/**
 * The database the server under test opens — and the one the setup project
 * seeds. `playwright.config.ts` hands it to `scripts/e2e-server.ts`; with an
 * external server (`PLAYWRIGHT_BASE_URL`) set `E2E_DATABASE_PATH` to that
 * server's file, or the seed lands in the wrong one.
 */
export const DATABASE_PATH = process.env.E2E_DATABASE_PATH ?? 'data/e2e/choreganized.db';

export type Account = {
	key: 'owner' | 'visual' | 'guests' | 'fullhouse';
	name: string;
	email: string;
	password: string;
	/** Extra `scripts/seed.ts` flags for this household. */
	seed?: string[];
};

export const ACCOUNTS: Account[] = [
	{ key: 'owner', name: 'Lukas Test', email: 'owner@e2e.test', password: 'e2e-password-owner' },
	{ key: 'visual', name: 'Visual Test', email: 'visual@e2e.test', password: 'e2e-password-visual' },
	/**
	 * The sketch's weekend with Jonas (→ plan 38, `--guests`): a guest on the
	 * balance card, screenshotted like `visual` and, like it, never touched.
	 */
	{
		key: 'guests',
		name: 'Lukas Guests',
		email: 'guests@e2e.test',
		password: 'e2e-password-guests',
		seed: ['--guests']
	},
	/**
	 * As many members as there are colours (`--full-house`): the screens that
	 * list everybody, screenshotted at their widest. Unmutated, like `visual`.
	 */
	{
		key: 'fullhouse',
		name: 'Lukas Full House',
		email: 'fullhouse@e2e.test',
		password: 'e2e-password-fullhouse',
		seed: ['--full-house']
	}
];

export const storageStateFor = (key: Account['key']) => `tests/.auth/${key}.json`;

/** What the seed script gives every household (→ scripts/seed-data.ts). */
export const SEED = {
	householdName: SEED_HOUSEHOLD_NAME,
	housemate: SEED_HOUSEMATE_NAME,
	stores: SEED_STORE_NAMES,
	checklist: SEED_CHECKLIST_NAME,
	checklistItems: SEED_CHECKLIST_ITEMS,
	items: SEED_ITEM_NAMES,
	recipes: SEED_RECIPE_NAMES
};
