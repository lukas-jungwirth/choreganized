/**
 * What the recipe importer sees on a page (→ docs/plans/25-agent-evidence.md).
 *
 *   npm run import:probe -- <url>                 which reader matched, the steps, the ingredients
 *   npm run import:probe -- <url> --save <name>   …and keep the raw page as a reader fixture
 *   npm run import:probe -- <url> --save <name> --trim   …without scripts, styles, SVG and comments
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
		...withParts(card.ingredientLines, card.ingredientSections, (line) => `  - ${line}`),
		'',
		`Steps (${card.steps.length}):`,
		...withParts(card.steps, card.stepSections, (step, index) => `  ${index + 1}. ${step}`)
	);
	return lines.join('\n');
}

/** Rows with a `[Part]` line wherever a new part starts (→ plan 44). */
function withParts(
	rows: string[],
	sections: (string | null)[],
	row: (text: string, index: number) => string
): string[] {
	return rows.flatMap((text, index) => {
		const part = sections[index] ?? null;
		const starts = part !== null && (index === 0 || sections[index - 1] !== part);
		return starts ? [`  [${part}]`, row(text, index)] : [row(text, index)];
	});
}

/**
 * A page without what no reader reads (→ plan 44): scripts other than JSON-LD,
 * styles, inline SVG and comments. A recipe page is 300 KB to 2 MB of that and
 * 20 to 150 KB of the rest. Regexes, not a parser, so what stays is the page's
 * own bytes; the probe refuses to save a trim that reads differently.
 */
export function trimPage(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (whole, attributes: string) =>
			/application\/ld\+json/i.test(attributes) ? whole : ''
		)
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
		.replace(
			/<link\b[^>]*\brel\s*=\s*["']?(?:stylesheet|preload|prefetch|preconnect|dns-prefetch|modulepreload)[^>]*>/gi,
			''
		)
		.replace(/\s(?:style|srcset|data-srcset|sizes|data-sizes)\s*=\s*"[^"]*"/gi, '');
}

/** The raw page with a provenance comment, kept after the doctype so it stays first. */
export function fixtureFile(url: string, html: string, fetchedOn: string, trimmed = false): string {
	const how = trimmed
		? 'Trimmed by --trim (no scripts but JSON-LD, no styles, SVG or comments); the rest byte for byte'
		: 'Kept byte for byte';
	const note = `<!--\n  ${url},\n  saved ${fetchedOn} by \`npm run import:probe\`. ${how}: do not reformat.\n-->\n`;
	const doctype = /^\s*<!doctype[^>]*>\s*/i.exec(html)?.[0];
	return doctype ? `${doctype}${note}${html.slice(doctype.length)}` : `${note}${html}`;
}

/** Whether the trimmed page gives the same card, reader and image as the full one. */
function sameReading(
	importer: typeof import('../src/lib/server/recipe-import'),
	fetched: { html: string; finalUrl: string },
	trimmed: string
): boolean {
	const full = importer.readFetchedPage(fetched);
	const trim = importer.readFetchedPage({ ...fetched, html: trimmed });
	return (
		JSON.stringify([full.card, full.reader, full.image, full.text]) ===
		JSON.stringify([trim.card, trim.reader, trim.image, trim.text])
	);
}

async function main(argv: string[]) {
	const trim = argv.includes('--trim');
	const [url, flag, name] = argv.filter((arg) => arg !== '--trim');
	if (!url || (flag !== undefined && (flag !== '--save' || !name)) || (trim && !name)) {
		console.error('Usage: npm run import:probe -- <url> [--save <name> [--trim]]');
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
			const html = trim ? trimPage(fetched.html) : fetched.html;
			if (trim && !sameReading(importer, fetched, html)) {
				console.error('\nThe trimmed page reads differently from the full one; not saved.');
				process.exitCode = 1;
				return;
			}
			writeFileSync(target, fixtureFile(url, html, new Date().toISOString().slice(0, 10), trim));
			const kb = Math.round(Buffer.byteLength(html) / 1024);
			console.log(`\nSaved the ${trim ? 'trimmed' : 'raw'} page (${kb} KB) to ${target}.`);
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
