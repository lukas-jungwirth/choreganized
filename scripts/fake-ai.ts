/**
 * A stand-in for all four AI providers (→ plan 20, docs/TESTING.md "Fake AI").
 *
 * The Playwright journeys and a hand verification both need AI imports that
 * work without a real key — and that fail on cue, because the backup is the
 * feature. So this answers each provider's own wire format on its own path
 * prefix (`/gemini`, `/openai`, `/anthropic`, `/openrouter`), and the app is
 * pointed at it with `AI_<PROVIDER>_BASE_URL` — which the app honours **only in
 * E2E mode** (→ `src/lib/server/ai/index.ts`).
 *
 * Behaviour is chosen by what the household typed, so a test needs no setup
 * call:
 *   - a key containing `bad`      → that provider's "key refused"
 *   - a model containing `busy`   → 429, a full free tier
 *   - a model containing `down`   → 503
 *   - anything else               → a recipe whose name says who answered
 *
 * `GET /__requests` returns what each call asked for (keys stripped), so a test
 * can check what reached the model — the instructions, say — without a real one.
 *
 * Run alone with `node scripts/fake-ai.ts [port]` (the `fake-ai` launch entry);
 * `scripts/e2e-server.ts` imports `startFakeAi` instead.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type Provider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

type Logged = { provider: Provider; path: string; model: string | null; body: unknown };

const NAMES: Record<Provider, string> = {
	gemini: 'Gemini',
	openai: 'OpenAI',
	anthropic: 'Claude',
	openrouter: 'OpenRouter'
};

/** What each provider's listing returns — the recommended model first-ish, one busy one. */
const MODELS = {
	gemini: [
		{ name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest' },
		{ name: 'models/gemini-busy-flash', displayName: 'Gemini Busy Flash' },
		{ name: 'models/gemini-down-flash', displayName: 'Gemini Down Flash' }
	].map((model) => ({ ...model, supportedGenerationMethods: ['generateContent'] })),
	openai: [
		{ id: 'gpt-5-mini', created: 1_754_000_000 },
		{ id: 'gpt-5-busy', created: 1_754_000_001 }
	],
	anthropic: [
		{
			id: 'claude-haiku-5-5',
			display_name: 'Claude Haiku 5.5',
			created_at: '2026-08-01T00:00:00Z'
		},
		{ id: 'claude-busy-5-5', display_name: 'Claude Busy 5.5', created_at: '2026-07-01T00:00:00Z' }
	].map((model) => ({
		...model,
		capabilities: { structured_outputs: { supported: true }, image_input: { supported: true } }
	})),
	openrouter: [
		{
			id: 'fake/free-vision:free',
			name: 'Fake: Free Vision (free)',
			created: 1_750_000_000,
			pricing: { prompt: '0', completion: '0' },
			architecture: { input_modalities: ['text', 'image'] },
			supported_parameters: ['structured_outputs']
		}
	]
};

/**
 * The answer to a recipe request, in whatever shape the request's schema asks
 * for: the probe's `{ ok }`, plan 13's flat recipe, or — once plan 22's schema
 * arrives with structured steps — the enriched draft.
 */
function answerFor(provider: Provider, schema: Record<string, unknown> | null): unknown {
	const properties = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
	if ('ok' in properties) return { ok: true };

	const name = `${NAMES[provider]} pancakes`;
	const stepItems = properties.steps?.items as Record<string, unknown> | undefined;
	const structured = String(stepItems?.type ?? '').toLowerCase() === 'object';

	if (!structured) {
		return {
			name,
			timeMinutes: 20,
			servings: 4,
			ingredients: ['200 g flour', '2 eggs', '300 ml milk'],
			steps: ['Whisk the flour, eggs and milk.', 'Fry each pancake for 2 minutes per side.']
		};
	}

	return {
		name,
		timeMinutes: 20,
		servings: 4,
		ingredients: [
			{ quantity: 200, unit: 'g', name: 'flour' },
			{ quantity: 2, unit: null, name: 'eggs' },
			{ quantity: 300, unit: 'ml', name: 'milk' }
		],
		steps: [
			{
				text: 'Whisk 200 g flour, 2 eggs and 300 ml milk.',
				timer: null,
				uses: [
					{ ingredient: 0, quantity: null },
					{ ingredient: 1, quantity: null },
					{ ingredient: 2, quantity: null }
				]
			},
			{
				text: 'Fry each pancake for 2 minutes per side.',
				timer: { seconds: 120, label: 'Pancake' },
				uses: []
			}
		]
	};
}

function send(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(body));
}

function keyOf(provider: Provider, req: IncomingMessage): string {
	if (provider === 'gemini') return String(req.headers['x-goog-api-key'] ?? '');
	if (provider === 'anthropic') return String(req.headers['x-api-key'] ?? '');
	return String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
}

function refusedKey(res: ServerResponse, provider: Provider) {
	if (provider === 'gemini') {
		return send(res, 400, {
			error: {
				code: 400,
				message: 'API key not valid. Please pass a valid API key.',
				status: 'INVALID_ARGUMENT',
				details: [{ reason: 'API_KEY_INVALID' }]
			}
		});
	}
	return send(res, 401, { error: { message: 'Invalid API key', type: 'authentication_error' } });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	const text = Buffer.concat(chunks).toString('utf8');
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

/** The schema a request carried, wherever its provider puts it. */
function schemaOf(
	provider: Provider,
	body: Record<string, unknown>
): Record<string, unknown> | null {
	const at = (...path: string[]) =>
		path.reduce<unknown>(
			(value, key) =>
				value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
			body
		) as Record<string, unknown> | undefined;

	if (provider === 'gemini') return at('generationConfig', 'responseSchema') ?? null;
	if (provider === 'anthropic') return at('output_config', 'format', 'schema') ?? null;
	return at('response_format', 'json_schema', 'schema') ?? null;
}

function generationReply(provider: Provider, answer: unknown) {
	const text = JSON.stringify(answer);
	if (provider === 'gemini') {
		return {
			candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }]
		};
	}
	if (provider === 'anthropic') {
		return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
	}
	return {
		choices: [
			{ message: { role: 'assistant', content: text, refusal: null }, finish_reason: 'stop' }
		]
	};
}

export async function startFakeAi(port = 0): Promise<{ url: string; close: () => Promise<void> }> {
	const log: Logged[] = [];

	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://fake.test');

		if (url.pathname === '/__requests') return send(res, 200, log);
		if (url.pathname === '/__reset') {
			log.length = 0;
			return send(res, 200, { ok: true });
		}

		const [, prefix, ...rest] = url.pathname.split('/');
		const provider = prefix as Provider;
		if (!(provider in NAMES)) return send(res, 404, { error: { message: 'unknown provider' } });
		const path = `/${rest.join('/')}`;

		if (keyOf(provider, req).includes('bad')) return refusedKey(res, provider);

		if (req.method === 'GET') {
			if (provider === 'gemini' && path === '/v1beta/models')
				return send(res, 200, { models: MODELS.gemini });
			if (provider === 'openai' && path === '/v1/models')
				return send(res, 200, { data: MODELS.openai });
			if (provider === 'anthropic' && path === '/v1/models') {
				return send(res, 200, { data: MODELS.anthropic, has_more: false });
			}
			if (provider === 'openrouter' && path === '/key')
				return send(res, 200, { data: { label: 'fake' } });
			if (provider === 'openrouter' && path === '/models')
				return send(res, 200, { data: MODELS.openrouter });
			return send(res, 404, { error: { message: `no ${path}` } });
		}

		const body = ((await readBody(req)) ?? {}) as Record<string, unknown>;
		const model =
			provider === 'gemini'
				? decodeURIComponent(/\/models\/([^:]+):generateContent$/.exec(path)?.[1] ?? '')
				: typeof body.model === 'string'
					? body.model
					: '';
		log.push({ provider, path, model, body });

		if (model.includes('busy')) {
			return send(res, 429, {
				error: { code: 429, message: 'Rate limit reached', status: 'RESOURCE_EXHAUSTED' }
			});
		}
		if (model.includes('down'))
			return send(res, 503, { error: { message: 'Service unavailable' } });

		return send(res, 200, generationReply(provider, answerFor(provider, schemaOf(provider, body))));
	});

	await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
	const address = server.address();
	const actual = typeof address === 'object' && address ? address.port : port;

	return {
		url: `http://127.0.0.1:${actual}`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
}

/** The base URLs to hand the app, one per provider. */
export function fakeAiEnv(url: string): Record<string, string> {
	return {
		AI_GEMINI_BASE_URL: `${url}/gemini`,
		AI_OPENAI_BASE_URL: `${url}/openai`,
		AI_ANTHROPIC_BASE_URL: `${url}/anthropic`,
		AI_OPENROUTER_BASE_URL: `${url}/openrouter`
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.argv[2] ?? 5199);
	const { url } = await startFakeAi(port);
	console.log(`fake-ai: listening on ${url} (gemini · openai · anthropic · openrouter)`);
}
