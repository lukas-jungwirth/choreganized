/**
 * The household's AI connections (→ services/ai.ts, plan 20, SPEC §6).
 *
 * What is pinned: a key never comes back out through anything a page loads;
 * only the owner changes the connections (→ DECISIONS #10); removing the main
 * one promotes the backup; and the migration that replaced plan 13's single
 * Gemini column carries an existing key across instead of switching AI off.
 */
import Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HouseholdError } from '$lib/server/services/household';
import {
	AiSettingsError,
	getAiConnections,
	getAiStatus,
	isAiEnabled,
	listAiModels,
	removeAiConnection,
	saveAiConnection
} from '$lib/server/services/ai';
import { makeHousehold } from '../helpers/db';

const GEMINI_KEY = 'AQ.Ab8RN6Lw-gemini-0123456789';
const CLAUDE_KEY = 'sk-ant-api03-claude-0123456789';

function setUp() {
	const house = makeHousehold({ housemates: ['Housemate'] });
	const [owner, housemate] = house.members;
	saveAiConnection(house.householdId, owner.id, 'primary', {
		provider: 'gemini',
		apiKey: GEMINI_KEY,
		model: 'gemini-flash-latest',
		vision: true
	});
	return { ...house, owner, housemate };
}

describe('getAiStatus', () => {
	it('names provider and model with a masked hint — never the key', () => {
		const { householdId } = setUp();
		const status = getAiStatus(householdId);

		assert.deepEqual(status.primary, {
			provider: 'gemini',
			model: 'gemini-flash-latest',
			hint: 'AQ.A…6789'
		});
		assert.equal(status.backup, null);
		assert.ok(!JSON.stringify(status).includes(GEMINI_KEY));
	});

	it('is off for a household that never set one up — and per household', () => {
		setUp();
		const other = makeHousehold();
		assert.equal(isAiEnabled(other.householdId), false);
		assert.deepEqual(getAiStatus(other.householdId), { primary: null, backup: null });
		assert.deepEqual(getAiConnections(other.householdId), []);
	});
});

describe('saveAiConnection', () => {
	it('is the owner’s: a housemate is refused, and nothing changes', () => {
		const { householdId, housemate } = setUp();

		assert.throws(
			() =>
				saveAiConnection(householdId, housemate.id, 'backup', {
					provider: 'anthropic',
					apiKey: CLAUDE_KEY,
					model: 'claude-haiku-5-5',
					vision: true
				}),
			(cause: unknown) => cause instanceof HouseholdError && cause.code === 'not-owner'
		);
		assert.equal(getAiStatus(householdId).backup, null);
	});

	it('keeps the stored key when only the model changes', () => {
		const { householdId, owner } = setUp();

		saveAiConnection(householdId, owner.id, 'primary', {
			provider: 'gemini',
			apiKey: null,
			model: 'gemini-3-flash',
			vision: true
		});

		const [connection] = getAiConnections(householdId);
		assert.equal(connection.model, 'gemini-3-flash');
		assert.equal(connection.apiKey, GEMINI_KEY);
	});

	it('wants a new key when the provider changes — a Gemini key is no use to OpenAI', () => {
		const { householdId, owner } = setUp();

		assert.throws(
			() =>
				saveAiConnection(householdId, owner.id, 'primary', {
					provider: 'openai',
					apiKey: null,
					model: 'gpt-5-mini',
					vision: true
				}),
			(cause: unknown) => cause instanceof AiSettingsError && cause.code === 'no-key'
		);
		assert.equal(getAiConnections(householdId)[0].provider, 'gemini');
	});

	it('makes a "backup" with no main connection the main one', () => {
		const { householdId, owner } = makeHousehold();
		const slot = saveAiConnection(householdId, owner.id, 'backup', {
			provider: 'openrouter',
			apiKey: 'sk-or-v1-0123456789abcdef',
			model: 'meta-llama/llama-4-scout:free',
			vision: true
		});

		assert.equal(slot, 'primary');
		assert.equal(getAiStatus(householdId).primary?.provider, 'openrouter');
	});

	it('hands the connections back primary first, keys included, for the server-side call', () => {
		const { householdId, owner } = setUp();
		saveAiConnection(householdId, owner.id, 'backup', {
			provider: 'anthropic',
			apiKey: CLAUDE_KEY,
			model: 'claude-haiku-5-5',
			vision: null
		});

		assert.deepEqual(
			getAiConnections(householdId).map((c) => [c.slot, c.provider, c.apiKey, c.vision]),
			[
				['primary', 'gemini', GEMINI_KEY, true],
				['backup', 'anthropic', CLAUDE_KEY, null]
			]
		);
	});
});

describe('removeAiConnection', () => {
	it('promotes the backup when the main one goes, so AI stays on', () => {
		const { householdId, owner } = setUp();
		saveAiConnection(householdId, owner.id, 'backup', {
			provider: 'anthropic',
			apiKey: CLAUDE_KEY,
			model: 'claude-haiku-5-5',
			vision: true
		});

		removeAiConnection(householdId, owner.id, 'primary');

		const status = getAiStatus(householdId);
		assert.equal(status.primary?.provider, 'anthropic');
		assert.equal(status.backup, null);
		assert.equal(isAiEnabled(householdId), true);
	});

	it('turns AI off when the last one goes — and is the owner’s too', () => {
		const { householdId, owner, housemate } = setUp();

		assert.throws(
			() => removeAiConnection(householdId, housemate.id, 'primary'),
			(cause: unknown) => cause instanceof HouseholdError && cause.code === 'not-owner'
		);

		removeAiConnection(householdId, owner.id, 'primary');
		assert.equal(isAiEnabled(householdId), false);
	});
});

describe('listAiModels', () => {
	it('is refused to a housemate before any provider is asked', async () => {
		const { householdId, housemate } = setUp();
		let asked = false;
		const fetcher = (async () => {
			asked = true;
			return Response.json({ models: [] });
		}) as typeof fetch;

		await assert.rejects(
			listAiModels(householdId, housemate.id, 'primary', 'gemini', null, fetcher),
			(cause: unknown) => cause instanceof HouseholdError && cause.code === 'not-owner'
		);
		assert.equal(asked, false);
	});

	it('lists with the stored key when none is typed, but only for the same provider', async () => {
		const { householdId, owner } = setUp();
		const seen: string[] = [];
		const fetcher = (async (_url: RequestInfo | URL, init: RequestInit = {}) => {
			seen.push((init.headers as Record<string, string>)['x-goog-api-key']);
			return Response.json({
				models: [
					{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }
				]
			});
		}) as typeof fetch;

		const listing = await listAiModels(householdId, owner.id, 'primary', 'gemini', null, fetcher);
		assert.equal(listing.recommended, 'gemini-flash-latest');
		assert.deepEqual(seen, [GEMINI_KEY]);

		await assert.rejects(
			listAiModels(householdId, owner.id, 'primary', 'openai', null, fetcher),
			(cause: unknown) => cause instanceof AiSettingsError && cause.code === 'no-key'
		);
	});
});

describe('migration 0013 — plan 13’s Gemini key becomes the primary connection', () => {
	it('carries a key across, leaves a blank one behind, and drops the column', () => {
		const migrations = readMigrationFiles({ migrationsFolder: 'src/lib/server/db/migrations' });
		const target = migrations.findIndex((migration) =>
			migration.sql.some((statement) => statement.includes('CREATE TABLE `ai_connections`'))
		);
		assert.ok(target > 0, 'the ai_connections migration exists');

		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		const run = (index: number) => {
			for (const statement of migrations[index].sql) {
				if (statement.trim()) sqlite.exec(statement);
			}
		};

		for (let index = 0; index < target; index++) run(index);

		const insert = sqlite.prepare(
			'INSERT INTO households (id, name, timezone, gemini_api_key, created_at) VALUES (?, ?, ?, ?, ?)'
		);
		insert.run('h-with-key', 'Keyed', 'Europe/Vienna', `  ${GEMINI_KEY}  `, Date.now());
		insert.run('h-blank', 'Blank', 'Europe/Vienna', '   ', Date.now());
		insert.run('h-none', 'None', 'Europe/Vienna', null, Date.now());

		run(target);

		const rows = sqlite
			.prepare(
				'SELECT id, household_id, slot, provider, api_key, model, vision, created_at FROM ai_connections'
			)
			.all() as Record<string, unknown>[];

		assert.equal(rows.length, 1);
		const [row] = rows;
		assert.equal(row.household_id, 'h-with-key');
		assert.equal(row.slot, 'primary');
		assert.equal(row.provider, 'gemini');
		assert.equal(row.api_key, GEMINI_KEY);
		assert.equal(row.model, 'gemini-flash-latest');
		assert.equal(row.vision, 1);
		assert.match(
			String(row.id),
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
		assert.ok(Math.abs(Number(row.created_at) - Date.now()) < 60_000, 'stamped in ms, now');

		const columns = sqlite.prepare('PRAGMA table_info(households)').all() as { name: string }[];
		assert.ok(!columns.some((column) => column.name === 'gemini_api_key'));
		// The households themselves survived the column drop.
		assert.equal(
			(sqlite.prepare('SELECT count(*) AS n FROM households').get() as { n: number }).n,
			3
		);
	});
});
