/**
 * The provider registry (→ plan 20): one adapter per provider, and where each
 * one's API lives.
 *
 * The base URL is overridable **only in E2E mode** (`AI_GEMINI_BASE_URL`, …),
 * which is what lets the Playwright suite point every provider at
 * `scripts/fake-ai.ts`. Outside it the variables are ignored on purpose: a key
 * is the household's secret, and a stray variable on a deploy must not be able
 * to send it somewhere other than its provider (→ DECISIONS #146). Read per
 * call, because `$env/dynamic/private` is empty while the app builds.
 */
import { env } from '$env/dynamic/private';
import type { AiProvider } from '$lib/ai';
import { e2eMode } from '../e2e-mode';
import { anthropic } from './providers/anthropic';
import { gemini } from './providers/gemini';
import { openai } from './providers/openai';
import { openrouter } from './providers/openrouter';
import type { ProviderAdapter } from './types';

export const ADAPTERS: Record<AiProvider, ProviderAdapter> = {
	gemini,
	openai,
	anthropic,
	openrouter
};

const OVERRIDE: Record<AiProvider, string> = {
	gemini: 'AI_GEMINI_BASE_URL',
	openai: 'AI_OPENAI_BASE_URL',
	anthropic: 'AI_ANTHROPIC_BASE_URL',
	openrouter: 'AI_OPENROUTER_BASE_URL'
};

export function baseUrlFor(provider: AiProvider): string {
	const override = e2eMode() ? env[OVERRIDE[provider]]?.trim() : '';
	return (override || ADAPTERS[provider].defaultBaseUrl).replace(/\/+$/, '');
}

export {
	AiError,
	type AiErrorCode,
	type AiPart,
	type GenerateRequest,
	type ModelInfo
} from './types';
