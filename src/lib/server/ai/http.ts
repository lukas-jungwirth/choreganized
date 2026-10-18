/**
 * The one way a provider adapter talks to its API (→ plan 20): plain `fetch`,
 * a JSON body back, and every failure turned into an `AiError` by **HTTP
 * status** — the same reading for all four providers, which is the reason
 * there are no SDKs here (→ DECISIONS #146). A rejected key is a 401/403 at
 * OpenAI, Anthropic and OpenRouter and a 400 "API key not valid" at Google; a
 * spent free tier is a 429 everywhere; an overloaded service is a 5xx (529 at
 * Anthropic). The provider's own message is read only to tell those apart —
 * never shown, never logged with the key.
 */
import type { AiProvider } from '$lib/ai';
import { AiError, type AiErrorCode } from './types';

/** A provider's error body, as far as all four agree: `{ error: { message, code | type | status } }`. */
type ErrorBody = {
	error?: { message?: unknown; code?: unknown; type?: unknown; status?: unknown };
};

export async function requestJson(
	provider: AiProvider,
	url: string,
	init: RequestInit,
	fetcher: typeof fetch = fetch
): Promise<unknown> {
	let response: Response;
	try {
		response = await fetcher(url, init);
	} catch (cause) {
		throw new AiError(isAbort(cause) ? 'timeout' : 'unavailable', provider);
	}

	let text: string;
	try {
		text = await response.text();
	} catch (cause) {
		// The body can be cut off by the same budget that guards the request.
		throw new AiError(isAbort(cause) ? 'timeout' : 'unavailable', provider);
	}

	const body = parseLoose(text);
	if (!response.ok) throw new AiError(codeForStatus(response.status, body), provider);
	return body;
}

/** `AbortSignal.timeout` rejects with a `TimeoutError`; a manual abort with an `AbortError`. */
function isAbort(cause: unknown): boolean {
	return cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
}

function parseLoose(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Status first, message second — and only for the 400/429 cases where one
 * status means two different things to the person reading the error.
 */
export function codeForStatus(status: number, body: unknown): AiErrorCode {
	const { message, code } = readError(body);

	if (status === 401 || status === 403) return 'bad-key';
	if (status === 402) return 'quota';

	if (status === 429) {
		// OpenAI says "out of credit" with a 429 and its own code; everyone else's
		// 429 is a rate limit (Google's free tier says "quota" for both, so it reads
		// as the busier, more temporary of the two).
		return code === 'insufficient_quota' ? 'quota' : 'rate-limited';
	}

	if (status === 404) {
		// OpenRouter's "No endpoints found that support …": the model exists, just
		// not with JSON output (or images) anywhere it routes.
		return /no endpoints found/i.test(message) ? 'model-unsupported' : 'model-unavailable';
	}

	if (status === 400 || status === 422) {
		if (/api[\s_-]?key/i.test(message) || code === 'API_KEY_INVALID') return 'bad-key';
		if (/credit balance|insufficient (credit|funds)|billing/i.test(message)) return 'quota';
		if (
			/image|vision|multimodal|modalit|response_format|json_schema|json mode|structured|output_config|responseSchema|not supported|unsupported/i.test(
				message
			)
		) {
			return 'model-unsupported';
		}
		return 'failed';
	}

	if (status === 408 || status === 529 || status >= 500) return 'unavailable';
	return 'failed';
}

function readError(body: unknown): { message: string; code: string } {
	const error = (body as ErrorBody | null)?.error;
	if (!error || typeof error !== 'object') return { message: '', code: '' };

	const message = typeof error.message === 'string' ? error.message : '';
	// Google nests the machine-readable reason under `details`; everyone else
	// puts a string in `code` or `type`.
	const details = (error as { details?: { reason?: unknown }[] }).details;
	const reason = Array.isArray(details)
		? details.map((detail) => detail?.reason).find((value) => typeof value === 'string')
		: undefined;
	const code = [error.code, error.type, reason].find((value) => typeof value === 'string');

	return { message, code: typeof code === 'string' ? code : '' };
}

/**
 * The model's answer → JSON. Structured output is meant to be bare JSON, but a
 * model behind OpenRouter may still fence it (```json … ```), so the fence is
 * forgiven; anything that still isn't JSON is `bad-output`.
 */
export function parseJsonText(text: unknown, provider: AiProvider): unknown {
	if (typeof text !== 'string' || !text.trim()) throw new AiError('bad-output', provider);

	const unfenced = text
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/, '');

	try {
		return JSON.parse(unfenced);
	} catch {
		throw new AiError('bad-output', provider);
	}
}

/** Narrowing for the providers' loosely typed JSON. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
