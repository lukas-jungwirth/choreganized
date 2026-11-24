/**
 * How well the import does on real pages (→ docs/plans/44-checked-import.md,
 * DECISIONS #318).
 *
 *   npm run import:eval                 every fixture, through the real pipeline, with
 *                                       EVAL_AI_PROVIDER · EVAL_AI_MODEL · EVAL_AI_KEY from .env
 *   npm run import:eval -- --fake       the same against the fake provider (scripts/fake-ai.ts)
 *   npm run import:eval -- --record     …and keep each answer in tests/fixtures/ai-answers/
 *   npm run import:eval -- <name> …     only these fixtures
 *
 * Each fixture page (`src/lib/utils/fixtures/`) is read the way an import reads
 * it (`readFetchedPage`), sent through `importRecipe`, and the raw answer is
 * run through the gate once more to count what it kept, dropped and flagged.
 * One row per page: page lines covered by the model, rows invented, amounts
 * agreeing with the page, names clean, parts found of those a person expects
 * (`tests/fixtures/import-expected.json`), steps found word for word,
 * ingredients linked to a step, and `check` items.
 *
 * The key lives in `.env` only: never committed, never in CI, never on a
 * deploy. Without one, only `--fake` runs, and the numbers say nothing about a
 * real model, only that the pipeline and the table work.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { ProviderAdapter } from '../src/lib/server/ai/types';
import type { AiProvider } from '../src/lib/ai';
import type { RecipePrefill } from '../src/lib/utils/recipes';
import { answerFor } from './fake-ai.ts';

const FIXTURES = 'src/lib/utils/fixtures';
const ANSWERS = 'tests/fixtures/ai-answers';
const EXPECTED = 'tests/fixtures/import-expected.json';

/** What a person expects of a page: its parts, and the ingredients that rightly have no step. */
export type Expected = {
	url: string;
	parts?: string[];
	unused?: string[];
};

/** One page's numbers. Fractions are kept as counts, so a row reads "21/22". */
export type EvalRow = {
	page: string;
	lines: [number, number];
	invented: number;
	amounts: [number, number];
	names: [number, number];
	parts: [number, number];
	steps: [number, number];
	linked: [number, number];
	checks: number;
	error?: string;
};

/**
 * The numbers for one answer: the draft the gate made of it, the card it was
 * checked against, and how many rows the gate dropped as inventions.
 */
export function scoreDraft(
	page: string,
	draft: Omit<RecipePrefill, 'photo'>,
	lineCount: number,
	invented: number,
	expected: Expected | undefined
): EvalRow {
	const checks = draft.checks ?? [];
	const count = (kind: string) => checks.filter((check) => check.kind === kind).length;
	const rows = draft.ingredientLines.length;

	const sections = new Set(
		[
			...(draft.ingredientDetails ?? []).map((one) => one?.section ?? ''),
			...draft.steps.map((step) => step.section ?? '')
		]
			.filter(Boolean)
			.map((name) => name.toLowerCase())
	);
	const wanted = expected?.parts ?? [];
	const found = wanted.filter((part) =>
		[...sections].some((name) => name.includes(part.toLowerCase()))
	).length;

	const used = new Set(
		draft.steps.flatMap((step) => (step.uses ?? []).map((use) => use.ingredient))
	);
	const rightlyUnused = new Set((expected?.unused ?? []).map((name) => name.toLowerCase()));
	const linkable = draft.ingredientLines.filter(
		(line) => ![...rightlyUnused].some((name) => line.toLowerCase().includes(name))
	).length;
	const linked = draft.ingredientLines.filter(
		(line, at) =>
			used.has(at) && ![...rightlyUnused].some((name) => line.toLowerCase().includes(name))
	).length;

	return {
		page,
		lines: [lineCount - count('line-added'), lineCount],
		invented,
		amounts: [rows - count('amount-differs'), rows],
		names: [rows - count('name-differs'), rows],
		parts: [found, wanted.length],
		steps: [draft.steps.length - count('reworded'), draft.steps.length],
		linked: [linked, linkable],
		checks: checks.filter((check) => check.level === 'check').length
	};
}

/** The table, as Markdown, with a totals row and a median of check items. */
export function evalTable(rows: EvalRow[], label: string): string {
	const pair = ([a, b]: [number, number]) => (b ? `${a}/${b}` : '–');
	const sum = (pick: (row: EvalRow) => [number, number]): [number, number] =>
		rows.reduce<[number, number]>(
			(total, row) => [total[0] + pick(row)[0], total[1] + pick(row)[1]],
			[0, 0]
		);
	const percent = ([a, b]: [number, number]) => (b ? `${Math.round((a / b) * 100)} %` : '–');
	const sorted = rows.map((row) => row.checks).sort((a, b) => a - b);
	const median = sorted.length
		? sorted.length % 2
			? sorted[(sorted.length - 1) / 2]
			: (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
		: 0;

	const lines = [
		`Import eval: ${label}`,
		'',
		'| Page | Lines covered | Invented | Amounts agree | Names clean | Parts found | Steps word for word | Linked | Checks |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows.map((row) =>
			row.error
				? `| ${row.page} | ${row.error} | | | | | | | |`
				: `| ${row.page} | ${pair(row.lines)} | ${row.invented} | ${pair(row.amounts)} | ${pair(row.names)} | ${pair(row.parts)} | ${pair(row.steps)} | ${pair(row.linked)} | ${row.checks} |`
		),
		`| **All** | ${percent(sum((row) => row.lines))} | ${rows.reduce((n, row) => n + row.invented, 0)} | ${percent(sum((row) => row.amounts))} | ${percent(sum((row) => row.names))} | ${percent(sum((row) => row.parts))} | ${percent(sum((row) => row.steps))} | ${percent(sum((row) => row.linked))} | median ${median} |`
	];
	return lines.join('\n');
}

/** Adapters that answer as `scripts/fake-ai.ts` does, without a server. */
export function fakeAdapters(): Record<AiProvider, ProviderAdapter> {
	const make = (provider: AiProvider): ProviderAdapter => ({
		defaultBaseUrl: 'http://fake.test',
		generate: async (_call, request) =>
			answerFor(provider, request.schema as Record<string, unknown>, { parts: request.parts }),
		listModels: async () => [],
		recommend: () => null
	});
	return {
		gemini: make('gemini'),
		openai: make('openai'),
		anthropic: make('anthropic'),
		openrouter: make('openrouter')
	};
}

/** Rows of a raw answer that name no line of the card: what the gate drops as inventions. */
export function inventedRows(answer: unknown, lineCount: number | null): number {
	if (lineCount === null) return 0;
	const rows = (answer as { ingredients?: unknown } | null)?.ingredients;
	if (!Array.isArray(rows)) return 0;
	return rows.filter((row) => {
		const source = (row as { source?: unknown } | null)?.source;
		return !(
			typeof source === 'number' &&
			Number.isInteger(source) &&
			source >= 0 &&
			source < lineCount
		);
	}).length;
}

type Modules = {
	importer: typeof import('../src/lib/server/recipe-import');
	ai: typeof import('../src/lib/server/services/ai-import');
	adapters: typeof import('../src/lib/server/ai/index');
};

/**
 * One fixture through the pipeline: read, one call, the gate. The adapter is
 * wrapped so the raw answer is kept, to count inventions and to `--record` it.
 */
export async function evalPage(
	modules: Modules,
	name: string,
	connection: { provider: AiProvider; model: string; apiKey: string },
	adapters: Record<AiProvider, ProviderAdapter>,
	expected: Expected | undefined
): Promise<{ row: EvalRow; answer: unknown }> {
	const html = readFileSync(`${FIXTURES}/${name}.html`, 'utf8');
	const page = modules.importer.readFetchedPage({ html, finalUrl: expected?.url ?? 'https://x/' });

	let answer: unknown = null;
	const keeping = Object.fromEntries(
		Object.entries(adapters).map(([provider, adapter]) => [
			provider,
			{
				...adapter,
				generate: async (call, request) => (answer = await adapter.generate(call, request))
			} satisfies ProviderAdapter
		])
	) as Record<AiProvider, ProviderAdapter>;

	const card = page.card;
	const context = { instructions: { household: null, now: null }, run: { adapters: keeping } };
	try {
		const result = await modules.ai.importRecipe(
			[{ slot: 'primary', vision: null, ...connection }],
			{ card, text: page.text },
			context
		);
		return {
			row: scoreDraft(
				name,
				result.value,
				card?.ingredientLines.length ?? 0,
				inventedRows(answer, card?.ingredientLines.length ?? null),
				expected
			),
			answer
		};
	} catch (error) {
		const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		const empty: [number, number] = [0, 0];
		return {
			row: {
				page: name,
				lines: empty,
				invented: 0,
				amounts: empty,
				names: empty,
				parts: empty,
				steps: empty,
				linked: empty,
				checks: 0,
				error: message
			},
			answer
		};
	}
}

async function main(argv: string[]) {
	const fake = argv.includes('--fake');
	const record = argv.includes('--record');
	const only = argv.filter((arg) => !arg.startsWith('--'));

	const provider = process.env.EVAL_AI_PROVIDER as AiProvider | undefined;
	const model = process.env.EVAL_AI_MODEL;
	const apiKey = process.env.EVAL_AI_KEY;
	if (!fake && (!provider || !model || !apiKey)) {
		console.error(
			'No model to evaluate: set EVAL_AI_PROVIDER, EVAL_AI_MODEL and EVAL_AI_KEY in .env, or run with --fake.'
		);
		process.exit(2);
	}

	const expected: Record<string, Expected> = JSON.parse(readFileSync(EXPECTED, 'utf8'));
	const names = readdirSync(FIXTURES)
		.map((file) => file.replace(/\.html$/, ''))
		.filter((name) => name in expected)
		.filter((name) => !only.length || only.includes(name));

	const { createServer } = await import('vite');
	const vite = await createServer({
		appType: 'custom',
		logLevel: 'error',
		server: { middlewareMode: true, hmr: false, ws: false }
	});

	try {
		const modules: Modules = {
			importer: await vite.ssrLoadModule('/src/lib/server/recipe-import.ts'),
			ai: await vite.ssrLoadModule('/src/lib/server/services/ai-import.ts'),
			adapters: await vite.ssrLoadModule('/src/lib/server/ai/index.ts')
		} as Modules;
		const adapters = fake ? fakeAdapters() : modules.adapters.ADAPTERS;
		const connection = fake
			? { provider: 'gemini' as const, model: 'fake', apiKey: 'fake' }
			: { provider: provider!, model: model!, apiKey: apiKey! };

		const rows: EvalRow[] = [];
		for (const name of names) {
			const { row, answer } = await evalPage(modules, name, connection, adapters, expected[name]);
			rows.push(row);
			if (record && answer !== null) {
				if (!existsSync(ANSWERS)) mkdirSync(ANSWERS, { recursive: true });
				const file = `${ANSWERS}/${fake ? 'fake-' : ''}${name}.json`;
				writeFileSync(file, `${JSON.stringify(answer, null, '\t')}\n`);
			}
		}

		const label = fake ? 'the fake provider (no real model)' : `${provider} · ${model}`;
		console.log(evalTable(rows, label));
	} finally {
		await vite.close();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
