/**
 * The import probe's report (→ docs/plans/25-agent-evidence.md), read off the
 * real einfachkochen.de page from issue #31 through the importer's own
 * `readFetchedPage` — the same path `npm run import:probe` takes after its fetch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { readFetchedPage } from '../src/lib/server/recipe-import';
import { fixtureFile, probeReport } from './import-probe';

const url = 'https://www.einfachkochen.de/rezepte/quiche-mit-lachs-genial-einfach-so-lecker';
const html = readFileSync(
	new URL('../src/lib/utils/fixtures/einfachkochen-quiche.html', import.meta.url),
	'utf8'
);

describe('probeReport', () => {
	const report = probeReport(url, readFetchedPage({ html, finalUrl: url }));

	it('names the reader and prints six whole steps', () => {
		assert.match(report, /^Reader: JSON-LD$/m);
		assert.match(report, /^Steps \(6\):$/m);
		assert.match(
			report,
			/^ {2}4\. Eier, Sahne, Crème fraîche und Senf glattrühren .* und einen Rand formen\.$/m
		);
		assert.match(report, /^ {2}6\. Quiche etwas abkühlen lassen.*Guten Appetit!$/m);
	});

	it('lists the ingredients one per line', () => {
		const count = Number(/^Ingredients \((\d+)\):$/m.exec(report)?.[1]);
		assert.ok(count > 5);
		assert.equal(report.match(/^ {2}- /gm)?.length, count);
	});

	it('shows where the redirects ended', () => {
		const moved = probeReport(
			'http://einfachkochen.de/q',
			readFetchedPage({ html, finalUrl: url })
		);
		assert.match(moved, new RegExp(`^→ ${url}$`, 'm'));
		assert.ok(!report.includes('→'), 'no arrow when nothing redirected');
	});

	it('says so when the page has no card', () => {
		const none = probeReport(
			url,
			readFetchedPage({ html: '<html><body><p>Nur Text.</p></body></html>', finalUrl: url })
		);
		assert.match(none, /^Reader: none — no recipe card on this page/m);
		assert.ok(!none.includes('Steps'));
	});

	it('names Microdata', () => {
		const microdata = `<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Strudel</h1><ol itemprop="recipeInstructions"><li>Ziehen.</li></ol></div>`;
		assert.match(
			probeReport(url, readFetchedPage({ html: microdata, finalUrl: url })),
			/^Reader: Microdata$/m
		);
	});
});

describe('fixtureFile', () => {
	it('keeps the doctype first and says where the page came from', () => {
		const file = fixtureFile(url, '<!doctype html>\n<html></html>', '2026-10-25');
		assert.ok(file.startsWith('<!doctype html>\n<!--\n  https://www.einfachkochen.de/'));
		assert.ok(file.includes('saved 2026-10-25'));
		assert.ok(file.endsWith('<html></html>'));
	});

	it('puts the note first when there is no doctype', () => {
		assert.ok(fixtureFile(url, '<html></html>', '2026-10-25').startsWith('<!--'));
	});
});
