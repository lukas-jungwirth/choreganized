/**
 * One AI call with a backup (→ plan 20, SPEC §6).
 *
 * The household's primary connection gets the request; if it fails for *any*
 * provider reason — limit reached, out of credit, key refused, model gone, an
 * answer that isn't the JSON asked for — the backup gets the same request. A
 * free tier that is full for the day is the case this exists for, and from the
 * kitchen every one of those failures looks the same: no recipe.
 *
 * **One time budget covers the whole thing.** Two providers each allowed the
 * full wait would leave someone watching a spinner for minutes; so the primary
 * is cut off early when there is a backup to try, and whichever runs last gets
 * whatever is left.
 *
 * `accept` is where the caller turns the raw JSON into what it wants. An
 * `AiError` from it (the answer was the wrong shape) moves on to the backup
 * like any other provider failure; anything else it throws ("there is no
 * recipe in this photo") is the answer, and stops here.
 */
import type { AiProvider, AiSlot } from '$lib/ai';
import { ADAPTERS, baseUrlFor } from './index';
import { AiError, type AiErrorCode, type GenerateRequest, type ProviderAdapter } from './types';

/** A connection as the service hands it over: with its key, server-side only. */
export type Connection = {
	slot: AiSlot;
	provider: AiProvider;
	apiKey: string;
	model: string;
	vision: boolean | null;
};

export type Answered<T> = {
	value: T;
	used: { slot: AiSlot; provider: AiProvider; model: string };
	/** Set when the backup answered: who failed first, and how. */
	fellBackFrom: { provider: AiProvider; code: AiErrorCode } | null;
};

/** Both connections failed: the primary's reason leads, the backup's rides along. */
export class AiFallbackError extends AiError {
	constructor(
		readonly first: AiError,
		readonly second: AiError
	) {
		super(first.code, first.provider);
		this.name = 'AiFallbackError';
	}
}

/** The whole request, start to finish — past this a person has given up waiting. */
export const AI_BUDGET_MS = 120_000;
/** The primary's share when a backup is waiting behind it. */
export const PRIMARY_SHARE_MS = 60_000;

export type RunOptions = {
	/** The request carries photos: skip a connection known not to read them. */
	needsVision?: boolean;
	budgetMs?: number;
	primaryShareMs?: number;
	/** Seams for tests. */
	adapters?: Record<AiProvider, ProviderAdapter>;
	fetch?: typeof fetch;
	now?: () => number;
};

export async function generateWithFallback<T>(
	connections: Connection[],
	request: GenerateRequest,
	accept: (data: unknown, provider: AiProvider) => T,
	options: RunOptions = {}
): Promise<Answered<T>> {
	const adapters = options.adapters ?? ADAPTERS;
	const now = options.now ?? Date.now;
	const budget = options.budgetMs ?? AI_BUDGET_MS;
	const share = options.primaryShareMs ?? PRIMARY_SHARE_MS;

	const ordered = [...connections].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
	if (!ordered.length) throw new AiError('failed');

	// A model that can't read images is skipped for a photo import rather than
	// called to fail — and the skip still counts as the reason for falling back.
	const skipped = options.needsVision ? ordered.filter((c) => c.vision === false) : [];
	const eligible = ordered.filter((connection) => !skipped.includes(connection));
	if (!eligible.length) throw new AiError('model-unsupported', ordered[0].provider);

	const deadline = now() + budget;
	const failures: AiError[] = skipped.map((c) => new AiError('model-unsupported', c.provider));

	for (const [index, connection] of eligible.entries()) {
		const last = index === eligible.length - 1;
		const remaining = Math.max(deadline - now(), 1);
		const limit = last ? remaining : Math.min(remaining, share);

		try {
			const data = await adapters[connection.provider].generate(
				{
					baseUrl: baseUrlFor(connection.provider),
					apiKey: connection.apiKey,
					model: connection.model,
					signal: AbortSignal.timeout(limit),
					fetch: options.fetch
				},
				request
			);
			const value = accept(data, connection.provider);
			const first = failures[0];

			return {
				value,
				used: { slot: connection.slot, provider: connection.provider, model: connection.model },
				fellBackFrom:
					first && first.provider ? { provider: first.provider, code: first.code } : null
			};
		} catch (cause) {
			// "There's no recipe here" is an answer, not a failure — the backup
			// would only be asked the same question about the same photo.
			if (!(cause instanceof AiError)) throw cause;
			failures.push(cause.provider ? cause : new AiError(cause.code, connection.provider));
		}
	}

	const [first, second] = failures;
	throw second ? new AiFallbackError(first, second) : first;
}

function slotRank(slot: AiSlot): number {
	return slot === 'primary' ? 0 : 1;
}
