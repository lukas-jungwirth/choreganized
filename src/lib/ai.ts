/**
 * What an AI connection *is* here (→ SPEC §6, plan 20): which provider, and
 * which of the household's two slots it fills.
 *
 * Free of any `$lib` or Svelte import for the same reason `theme.ts` is:
 * `schema.ts` loads it outside Vite (drizzle-kit, `db:seed`), and the settings
 * sheet loads it in the browser. The keys themselves never come near this file.
 */

/**
 * The providers a household can bring a key for. Order is the order the sheet
 * offers them in: Gemini first because its free tier is the easiest start,
 * OpenRouter last because it is a gateway to the others.
 */
export const AI_PROVIDERS = ['gemini', 'openai', 'anthropic', 'openrouter'] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/**
 * Two at most: the one every call goes to, and the one that answers when the
 * first is rate-limited, out of quota or down (→ `server/ai/run.ts`).
 */
export const AI_SLOTS = ['primary', 'backup'] as const;

export type AiSlot = (typeof AI_SLOTS)[number];

export function isAiProvider(value: unknown): value is AiProvider {
	return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value);
}

export function isAiSlot(value: unknown): value is AiSlot {
	return typeof value === 'string' && (AI_SLOTS as readonly string[]).includes(value);
}

/**
 * Where each provider hands out keys — a link, not copy, so it lives here
 * rather than in the catalog. Checked 2026-10-18.
 */
export const AI_KEY_URLS: Record<AiProvider, string> = {
	gemini: 'https://aistudio.google.com/apikey',
	openai: 'https://platform.openai.com/api-keys',
	anthropic: 'https://platform.claude.com/settings/keys',
	openrouter: 'https://openrouter.ai/settings/keys'
};

/**
 * A key is an **opaque secret we don't parse** (→ DECISIONS #112): Google alone
 * issues two formats (`AIza…`, `AQ.…`), and a prefix gate rejects valid keys
 * the day a provider changes its scheme. The only checks are that it is
 * plausibly a key — long enough, no whitespace, not a pasted paragraph — and the
 * real one is listing the provider's models with it (→ `services/ai.ts`).
 */
export const AI_KEY_MIN = 20;
export const AI_KEY_MAX = 400;

export function looksLikeApiKey(key: string): boolean {
	return key.length >= AI_KEY_MIN && key.length <= AI_KEY_MAX && !/\s/.test(key);
}

/**
 * A model id as the providers write them: `gemini-flash-latest`,
 * `gpt-5-mini`, `claude-haiku-5-5`, `meta-llama/llama-4-scout:free`. Typed by
 * hand only when a listing fails, so the check is shape, not membership.
 */
export const AI_MODEL_MAX = 120;

export function looksLikeModelId(model: string): boolean {
	return model.length > 0 && model.length <= AI_MODEL_MAX && /^[A-Za-z0-9][\w.:/@-]*$/.test(model);
}
