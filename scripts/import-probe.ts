/**
 * What the recipe importer sees on a page (→ docs/plans/25-agent-evidence.md).
 *
 *   npm run import:probe -- <url>                 which reader matched, the steps, the ingredients
 *   npm run import:probe -- <url> --save <name>   …and keep the raw page as a reader fixture
 *
 * Recipe-import bugs live in someone else's page, and a page summary (WebFetch)
 * drops the raw JSON-LD the importer actually reads — issue #31 was a
 * `HowToStep.text` sent as an array, which no summary shows. So this calls the
 * app's own `readRecipePage` path — the same guarded fetch, the same readers —
 * and prints what an import would put in the editor. `--save` writes the page
 * to `src/lib/utils/fixtures/<name>.html`, beside the reader tests, so the fix
 * gets a test against the real thing.
 *
 * Both agents may run it (`Bash(npm run import:probe:*)`); a desk session too.
 * The importer imports `$lib` and `$env`, which only resolve inside Vite, so
 * the module is loaded through a middleware-mode Vite server built from the
 * project's own config — about two seconds, no port opened.
 */
import { existsSync, writeFileSync } from 'node:fs';
import type { RecipePage } from '../src/lib/server/recipe-import';

const FIXTURES = 'src/lib/utils/fixtures';
const READERS = { 'json-ld': 'JSON-LD', microdata: 'Microdata' } as const;

/** The probe's report: plain text, one fact per line, every step whole. */
export function probeReport(url: string, page: RecipePage): string {
	const lines = [url];
	if (page.finalUrl !== url) lines.push(`→ ${page.finalUrl}`);

	const card = page.card;
	if (!page.reader || !card) {
		lines.push(
			'Reader: none — no recipe card on this page; an import offers the AI fallback.',
			`Readable text: ${page.text.length} characters (what a model would read).`
		);
		return lines.join('\n');
	}

	lines.push(
		`Reader: ${READERS[page.reader]}`,
		`Name: ${card.name}`,
		`Time: ${card.timeMinutes ?? '—'} min · Servings: ${card.servings ?? '—'}`,
		`Image: ${page.image ?? '—'}`,
		'',
		`Ingredients (${card.ingredientLines.length}):`,
		...card.ingredientLines.map((line) => `  - ${line}`),
		'',
		`Steps (${card.steps.length}):`,
		...card.steps.map((step, index) => `  ${index + 1}. ${step}`)
	);
	return lines.join('\n');
}

/** The raw page with a provenance comment, kept after the doctype so it stays first. */
export function fixtureFile(url: string, html: string, fetchedOn: string): string {
	const note = `<!--\n  ${url},\n  saved ${fetchedOn} by \`npm run import:probe\`. Kept byte for byte: do not reformat.\n-->\n`;
	const doctype = /^\s*<!doctype[^>]*>\s*/i.exec(html)?.[0];
	return doctype ? `${doctype}${note}${html.slice(doctype.length)}` : `${note}${html}`;
}

async function main(argv: string[]) {
	const [url, flag, name] = argv;
	if (!url || (flag !== undefined && (flag !== '--save' || !name))) {
		console.error('Usage: npm run import:probe -- <url> [--save <name>]');
		process.exit(2);
	}
	if (name !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
		console.error(`--save takes a file name like "chefkoch-gulasch", not "${name}".`);
		process.exit(2);
	}
	const target = name && `${FIXTURES}/${name}.html`;
	if (target && existsSync(target)) {
		console.error(`${target} already exists — pick another name; fixtures are never overwritten.`);
		process.exit(2);
	}

	const { createServer } = await import('vite');
	const vite = await createServer({
		appType: 'custom',
		logLevel: 'error',
		server: { middlewareMode: true, hmr: false, ws: false }
	});

	try {
		const importer: typeof import('../src/lib/server/recipe-import') = await vite.ssrLoadModule(
			'/src/lib/server/recipe-import.ts'
		);
		const fetched = await importer.fetchRecipePage(url);
		console.log(probeReport(url, importer.readFetchedPage(fetched)));

		if (target) {
			writeFileSync(target, fixtureFile(url, fetched.html, new Date().toISOString().slice(0, 10)));
			console.log(`\nSaved the raw page to ${target}.`);
		}
	} catch (error) {
		// The importer's own refusal (blocked, unreachable, not-html, …) is the answer.
		if (error instanceof Error && error.name === 'RecipeImportError') {
			console.log(`${url}\nRefused: ${error.message} — an import would show the same error.`);
			process.exitCode = 1;
		} else {
			throw error;
		}
	} finally {
		await vite.close();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
