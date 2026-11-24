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
 * The import's answer (→ plan 44) has two forms. Given a page's recipe card,
 * the fake echoes it the way a careful model would: one row per card line
 * (amount and unit read off the line's start, the rest as the name), the
 * card's steps word for word, a link wherever a row's first word stands in a
 * step. A saved recipe sent to be tidied (→ plan 48) is a card too, and the
 * fake also does what a tidy is for: what follows a comma in a line is the
 * note ("Hackfleisch, gemischtes" → Hackfleisch, note "gemischtes"). Given
 * text or photos, it answers `FAKE_PANCAKES`: two parts, a note,
 * an either/or and links with their words, for the paste the journeys type in
 * (`FAKE_PANCAKE_TEXT`).
 *
 * `GET /__requests` returns what each call asked for (keys stripped), so a test
 * can check what reached the model — the instructions, say — without a real one.
 *
 * Run alone with `node scripts/fake-ai.ts [port]` (the `fake-ai` launch entry);
 * `scripts/e2e-server.ts` imports `startFakeAi` instead.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export type Provider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

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

/** What the journeys paste in text mode: the fake's pancakes, word for word. */
export const FAKE_PANCAKE_TEXT = [
	'Pancakes',
	'Batter: 200 g flour, 2 eggs, 300 ml cold milk.',
	'Sauce: 150 g berries or cherries, 1 tbsp sugar.',
	'Whisk 200 g flour, 2 eggs and 300 ml milk. Fry each pancake for 2 minutes per side. Simmer the berries with the sugar for 5 minutes.'
].join('\n');

/** The import's answer to text or photos (→ plan 44): parts, a note, a choice, links. */
function fakePancakes(name: string) {
	return {
		name,
		timeMinutes: 20,
		servings: 4,
		ingredients: [
			row(null, 200, 'g', 'flour', { section: 'Batter' }),
			row(null, 2, null, 'eggs', { section: 'Batter' }),
			row(null, 300, 'ml', 'milk', { section: 'Batter', note: 'cold' }),
			row(null, 150, 'g', 'berries', { section: 'Sauce', alternative: 'cherries' }),
			row(null, 1, 'tbsp', 'sugar', { section: 'Sauce' })
		],
		steps: [
			{
				text: 'Whisk 200 g flour, 2 eggs and 300 ml milk.',
				section: 'Batter',
				timer: null,
				uses: [use(0, 'flour', '200 g'), use(1, 'eggs', '2'), use(2, 'milk', '300 ml')]
			},
			{
				text: 'Fry each pancake for 2 minutes per side.',
				section: 'Batter',
				timer: { seconds: 120, label: 'Pancake' },
				uses: []
			},
			{
				text: 'Simmer the berries with the sugar for 5 minutes.',
				section: 'Sauce',
				timer: null,
				uses: [use(3, 'berries', null), use(4, 'sugar', null)]
			}
		]
	};
}

function row(
	source: number | null,
	quantity: number | null,
	unit: string | null,
	name: string,
	extra: { section?: string; note?: string; alternative?: string } = {}
) {
	return {
		source,
		quantity,
		unit,
		countingWord: null,
		newUnit: null,
		name,
		note: extra.note ?? null,
		alternative: extra.alternative ?? null,
		section: extra.section ?? null
	};
}

function use(ingredient: number, phrase: string | null, amountPhrase: string | null) {
	return { ingredient, phrase, amountPhrase, quantity: null };
}

type Card = {
	name: string;
	servings: number | null;
	timeMinutes: number | null;
	ingredients: { source: number; line: string; section: string | null }[];
	steps: string[];
};

const UNITS: Record<string, string> = {
	g: 'g',
	gramm: 'g',
	kg: 'kg',
	ml: 'ml',
	l: 'L',
	liter: 'L',
	el: 'tbsp',
	tbsp: 'tbsp',
	tl: 'tsp',
	tsp: 'tsp',
	stk: 'pcs',
	'stk.': 'pcs',
	pck: 'pack',
	'pkg.': 'pack'
};

/** A card echoed the way a careful model reads it: rows by line, steps word for word. */
function echoCard(card: Card, saved = false) {
	const ingredients = card.ingredients.map(({ source, line, section }) => {
		if (!saved) return echoLine(source, line, section);
		// A tidy (→ plan 48): what follows the first comma is the note.
		const [head, ...rest] = line.split(',');
		const echoed = echoLine(source, head.trim(), section);
		return rest.length ? { ...echoed, note: rest.join(',').trim() } : echoed;
	});

	// A tidy leaves tips out, as a model may (→ plan 48: the review asks about them).
	const method = saved ? card.steps.filter((text) => !text.startsWith('Tipp:')) : card.steps;
	const steps = method.map((text) => ({
		text,
		section: null,
		timer: null,
		uses: ingredients.flatMap((ingredient, at) => {
			const word = ingredient.name.split(/[^\p{L}]+/u).find((one) => one.length >= 3);
			if (!word) return [];
			const found = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').exec(text);
			return found ? [use(at, found[0], null)] : [];
		})
	}));

	return {
		name: card.name,
		servings: card.servings,
		timeMinutes: card.timeMinutes,
		ingredients,
		steps,
		tags: [],
		diet: null
	};
}

/** One card line as a row: amount and unit off its start, the rest as the name. */
function echoLine(source: number, line: string, section: string | null) {
	const match = /^(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+)$/.exec(line);
	const unit = match ? UNITS[match[2].toLowerCase()] : undefined;
	if (match && unit) {
		return row(source, Number(match[1].replace(',', '.')), unit, match[3], {
			section: section ?? undefined
		});
	}
	const bare = /^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(line);
	if (bare) {
		return row(source, Number(bare[1].replace(',', '.')), null, bare[2], {
			section: section ?? undefined
		});
	}
	return row(source, null, null, line, { section: section ?? undefined });
}

/** The lead a website's card is sent after, and the one a saved recipe's tidy is (→ plan 48). */
const CARD_LEAD = 'The recipe card the website published:\n\n';
const SAVED_LEAD = 'A recipe the household saved earlier, as its recipe card.';

/** The card a request carried, if any: the import sends it as compact JSON after a fixed lead. */
function cardOf(body: unknown): { card: Card; saved: boolean } | null {
	const strings: string[] = [];
	const walk = (value: unknown) => {
		if (typeof value === 'string') strings.push(value);
		else if (Array.isArray(value)) value.forEach(walk);
		else if (value && typeof value === 'object') Object.values(value).forEach(walk);
	};
	walk(body);
	const text = strings.find((one) => one.startsWith(CARD_LEAD) || one.startsWith(SAVED_LEAD));
	if (!text) return null;
	try {
		const saved = text.startsWith(SAVED_LEAD);
		const json = saved ? text.slice(text.indexOf('{')) : text.slice(CARD_LEAD.length);
		return { card: JSON.parse(json) as Card, saved };
	} catch {
		return null;
	}
}

/**
 * The answer to a recipe request, in whatever shape the request's schema asks
 * for: the probe's `{ ok }`, plan 13's flat recipe, plan 22's enriched draft,
 * or plan 44's checked import.
 */
export function answerFor(
	provider: Provider,
	schema: Record<string, unknown> | null,
	body: unknown = null
): unknown {
	const properties = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
	if ('ok' in properties) return { ok: true };

	// Plan 41's sorting pass: one suggestion, for the first recipe asked about.
	if ('recipes' in properties) {
		return { recipes: [{ index: 0, tags: ['meal:dinner', 'kind:main'], diet: 'vegetarian' }] };
	}

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

	// Plan 44's contract: rows know their source line.
	const rowItems = (properties.ingredients?.items ?? {}) as Record<string, unknown>;
	if ('source' in ((rowItems.properties ?? {}) as Record<string, unknown>)) {
		const card = cardOf(body);
		const tags = { tags: ['meal:breakfast', 'kind:dessert'], diet: 'vegetarian' };
		return card ? echoCard(card.card, card.saved) : { ...tags, ...fakePancakes(name) };
	}

	// Plan 41's schema asks what the dish is as well.
	const tagged = 'tags' in properties ? { tags: ['meal:breakfast', 'kind:dessert'], diet: 'vegetarian' } : {}; // prettier-ignore

	return {
		...tagged,
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

		return send(
			res,
			200,
			generationReply(provider, answerFor(provider, schemaOf(provider, body), body))
		);
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
