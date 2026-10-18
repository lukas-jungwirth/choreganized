/**
 * The provider layer's vocabulary (→ plan 20, SPEC §6).
 *
 * Four providers, one shape: every adapter turns a `GenerateRequest` into the
 * provider's own wire format, sends it with plain `fetch`, and hands back the
 * parsed JSON the schema asked for — or throws an `AiError` with a code the
 * screens translate. Nothing above `providers/` knows which provider answered
 * except to name it.
 */
import type { AiProvider } from '$lib/ai';

export type AiErrorCode =
	/** The key was refused (401/403, or a 400 that names the key). */
	| 'bad-key'
	/** Too many requests (429) — most often a free tier's per-minute cap. */
	| 'rate-limited'
	/** Out of credit or out of the day's free quota (402, `insufficient_quota`, "credit balance"). */
	| 'quota'
	/** The model id isn't there (404) — retired, renamed, or typed wrong. */
	| 'model-unavailable'
	/** The model exists but can't do this: no images, or no JSON mode (a 400 that says so). */
	| 'model-unsupported'
	/** The provider is down or overloaded (5xx, 529), or the network failed. */
	| 'unavailable'
	/** No answer inside the time budget (→ `run.ts`). */
	| 'timeout'
	/** An answer that isn't the JSON we asked for: cut off, refused, or unparseable. */
	| 'bad-output'
	/** Anything else. */
	| 'failed';

export class AiError extends Error {
	constructor(
		readonly code: AiErrorCode,
		/** Which provider said so, for the message ("Gemini refused the key"). */
		readonly provider: AiProvider | null = null
	) {
		super(code);
		this.name = 'AiError';
	}
}

/** One piece of what the model reads: words, or a photo already re-encoded to WebP. */
export type AiPart = { type: 'text'; text: string } | { type: 'image'; webp: Buffer };

/** A JSON Schema object — the strict-mode subset every provider accepts (→ `schema.ts`). */
export type JsonSchema = Record<string, unknown>;

export type GenerateRequest = {
	/** The rules (system prompt). */
	system: string;
	/** The input, images first where there are any — the way every provider reads best. */
	parts: AiPart[];
	/** The shape of the answer. */
	schema: JsonSchema;
	/** A short identifier for the schema; some providers want one (`[a-zA-Z0-9_-]`). */
	schemaName: string;
	/** Room for the answer — and, on a thinking model, for the thinking before it. */
	maxOutputTokens: number;
};

/** What a provider needs to make a call: where, with which key, on which model. */
export type AiCall = {
	baseUrl: string;
	apiKey: string;
	model: string;
	signal?: AbortSignal;
	fetch?: typeof fetch;
};

/** One row of a provider's live model list, as the sheet offers it. */
export type ModelInfo = {
	id: string;
	/** The provider's display name, when it has one ("Claude Haiku 5.5"). */
	label: string;
	/** Newest first sorts on this where the provider says (ms since epoch). */
	created: number | null;
	/** Whether it costs nothing to call — only OpenRouter's listing says. */
	free: boolean | null;
	/** Whether it reads images, where the listing says. */
	vision: boolean | null;
};

export type ProviderAdapter = {
	/** Where its API lives unless E2E mode points it somewhere else (→ `config.ts`). */
	defaultBaseUrl: string;
	/** One structured-output call; resolves to the parsed (unvalidated) JSON. */
	generate(call: AiCall, request: GenerateRequest): Promise<unknown>;
	/**
	 * The models this key can call, filtered to the ones that can do JSON
	 * output, newest first. Doubles as the key check: a refused key throws
	 * `bad-key` here, before anything is saved.
	 */
	listModels(call: Omit<AiCall, 'model'>): Promise<ModelInfo[]>;
	/** Which of a live list to preselect — cheap and fast, the right default for an import. */
	recommend(models: ModelInfo[]): string | null;
};
