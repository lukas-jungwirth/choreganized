/**
 * The household's AI connections [6a] (→ plan 20, SPEC §6): which provider,
 * which model, which key — a primary and an optional backup.
 *
 * **The key never leaves the server.** `getAiStatus` is what a page may load:
 * provider, model and a masked hint. `getAiConnections`, with the keys, is for
 * the server-side call that spends them (→ `server/ai/run.ts`).
 *
 * Changing a connection is the owner's (→ DECISIONS #10), enforced here inside
 * the write's transaction with the same `requireOwner` the rest of the
 * household's owner-only writes use (→ #77). *Using* one is anyone's: any
 * member may import a recipe.
 */
import { and, eq } from 'drizzle-orm';
import type { AiProvider, AiSlot } from '$lib/ai';
import type { Messages } from '$lib/i18n';
import { ADAPTERS, baseUrlFor } from '../ai';
import { AiFallbackError, type Connection } from '../ai/run';
import { object, boolean } from '../ai/schema';
import { AiError, type ModelInfo } from '../ai/types';
import { db } from '../db';
import { aiConnections } from '../db/schema';
import { requireOwner } from './household';

/** What Settings may know about one connection. */
export type AiConnectionStatus = {
	provider: AiProvider;
	model: string;
	/** First four and last four of the key — enough to recognise it, never to use it. */
	hint: string;
};

export type AiStatus = { primary: AiConnectionStatus | null; backup: AiConnectionStatus | null };

export type AiSettingsErrorCode =
	/** Saving or listing with no key typed and none stored for that provider. */
	'no-key';

export class AiSettingsError extends Error {
	constructor(readonly code: AiSettingsErrorCode) {
		super(code);
		this.name = 'AiSettingsError';
	}
}

/** A listing is a quick question; past this the key is as good as unchecked. */
const LIST_TIMEOUT_MS = 20_000;
const TEST_TIMEOUT_MS = 45_000;

function rows(householdId: string) {
	return db.select().from(aiConnections).where(eq(aiConnections.householdId, householdId)).all();
}

export function getAiStatus(householdId: string): AiStatus {
	const status: AiStatus = { primary: null, backup: null };
	for (const row of rows(householdId)) {
		status[row.slot] = { provider: row.provider, model: row.model, hint: maskKey(row.apiKey) };
	}
	return status;
}

export function isAiEnabled(householdId: string): boolean {
	return rows(householdId).some((row) => row.slot === 'primary');
}

/** Server-side only, keys included — primary first. */
export function getAiConnections(householdId: string): Connection[] {
	return rows(householdId)
		.map(({ slot, provider, apiKey, model, vision }) => ({ slot, provider, apiKey, model, vision }))
		.sort((a, b) => (a.slot === 'primary' ? -1 : 1) - (b.slot === 'primary' ? -1 : 1));
}

export function maskKey(key: string): string {
	if (key.length <= 8) return '••••';
	return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/**
 * The stored key for a slot, but only while the provider is the same one — a
 * Gemini key is no use to OpenAI, so switching providers means pasting a new key.
 */
function storedKey(householdId: string, slot: AiSlot, provider: AiProvider): string | null {
	const row = db
		.select({ provider: aiConnections.provider, apiKey: aiConnections.apiKey })
		.from(aiConnections)
		.where(and(eq(aiConnections.householdId, householdId), eq(aiConnections.slot, slot)))
		.get();
	return row && row.provider === provider ? row.apiKey : null;
}

export type SaveAiConnectionInput = {
	provider: AiProvider;
	/** Null = keep the stored one (same provider only). */
	apiKey: string | null;
	model: string;
	vision: boolean | null;
};

/**
 * Create or replace one slot. A backup saved while there is no primary becomes
 * the primary — there is nothing to be the backup *of*. Shape checks (key and
 * model id) are the action's; this is the role check and the write.
 */
export function saveAiConnection(
	householdId: string,
	actorMemberId: string,
	slot: AiSlot,
	input: SaveAiConnectionInput
): AiSlot {
	return db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);

		const existing = tx
			.select()
			.from(aiConnections)
			.where(eq(aiConnections.householdId, householdId))
			.all();

		const target: AiSlot =
			slot === 'backup' && !existing.some((row) => row.slot === 'primary') ? 'primary' : slot;
		const current = existing.find((row) => row.slot === target);

		const apiKey =
			input.apiKey ?? (current && current.provider === input.provider ? current.apiKey : null);
		if (!apiKey) throw new AiSettingsError('no-key');

		const values = {
			provider: input.provider,
			apiKey,
			model: input.model,
			vision: input.vision,
			updatedAt: new Date()
		};

		if (current) {
			tx.update(aiConnections).set(values).where(eq(aiConnections.id, current.id)).run();
		} else {
			tx.insert(aiConnections)
				.values({ householdId, slot: target, ...values })
				.run();
		}

		return target;
	});
}

/** Remove one slot; removing the primary promotes the backup, so AI stays on if it can. */
export function removeAiConnection(householdId: string, actorMemberId: string, slot: AiSlot): void {
	db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);

		tx.delete(aiConnections)
			.where(and(eq(aiConnections.householdId, householdId), eq(aiConnections.slot, slot)))
			.run();

		if (slot === 'primary') {
			tx.update(aiConnections)
				.set({ slot: 'primary', updatedAt: new Date() })
				.where(and(eq(aiConnections.householdId, householdId), eq(aiConnections.slot, 'backup')))
				.run();
		}
	});
}

export type ModelListing = { models: ModelInfo[]; recommended: string | null };

/**
 * The provider's live model list for the sheet's picker — fetched with the key
 * being typed, or the stored one when editing a slot without retyping it.
 * Owner-only like the write it prepares, and the key check before Save: a
 * refused key throws `bad-key` here.
 */
export async function listAiModels(
	householdId: string,
	actorMemberId: string,
	slot: AiSlot,
	provider: AiProvider,
	typedKey: string | null,
	fetcher?: typeof fetch
): Promise<ModelListing> {
	db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);
	});

	const apiKey = typedKey ?? storedKey(householdId, slot, provider);
	if (!apiKey) throw new AiSettingsError('no-key');

	const adapter = ADAPTERS[provider];
	const models = await adapter.listModels({
		baseUrl: baseUrlFor(provider),
		apiKey,
		signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
		fetch: fetcher
	});

	return { models, recommended: adapter.recommend(models) };
}

const PROBE_SCHEMA = object({ ok: boolean() });

/**
 * "Test connection": a tiny real generation on the stored model, so a pass
 * means "an import will reach this model", not merely "the key is well formed".
 * An answer that isn't the probe's JSON still passes — the model *answered*,
 * which is all the test asks; a thinking model may spend a small budget before
 * it gets to the JSON.
 */
export async function testAiConnection(
	householdId: string,
	slot: AiSlot,
	fetcher?: typeof fetch
): Promise<void> {
	const connection = getAiConnections(householdId).find((row) => row.slot === slot);
	if (!connection) throw new AiSettingsError('no-key');

	try {
		await ADAPTERS[connection.provider].generate(
			{
				baseUrl: baseUrlFor(connection.provider),
				apiKey: connection.apiKey,
				model: connection.model,
				signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
				fetch: fetcher
			},
			{
				system: 'Answer with {"ok": true}.',
				parts: [{ type: 'text', text: 'ping' }],
				schema: PROBE_SCHEMA,
				schemaName: 'probe',
				maxOutputTokens: 1024
			}
		);
	} catch (cause) {
		if (cause instanceof AiError && cause.code === 'bad-output') return;
		throw cause;
	}
}

/**
 * Any AI failure in the reader's words, naming the provider — "Gemini refused
 * the key", not "the AI service" — and saying so when the backup failed too.
 */
export function aiErrorMessage(cause: unknown, m: Messages): string {
	const t = m.ai.error;
	if (cause instanceof AiSettingsError) return t.noKey;
	if (!(cause instanceof AiError)) return t.failed('');

	const name = cause.provider ? m.ai.providers[cause.provider].short : '';
	const message = (() => {
		switch (cause.code) {
			case 'bad-key':
				return t.badKey(name);
			case 'rate-limited':
				return t.rateLimited(name);
			case 'quota':
				return t.quota(name);
			case 'model-unavailable':
				return t.modelUnavailable(name);
			case 'model-unsupported':
				return t.modelUnsupported(name);
			case 'unavailable':
				return t.unavailable(name);
			case 'timeout':
				return t.timeout(name);
			case 'bad-output':
				return t.badOutput(name);
			case 'failed':
				return t.failed(name);
		}
	})();

	if (cause instanceof AiFallbackError) {
		const backup = cause.second.provider ? m.ai.providers[cause.second.provider].short : '';
		return `${message} ${t.backupFailed(backup)}`;
	}
	return message;
}
