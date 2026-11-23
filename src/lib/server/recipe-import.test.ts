/**
 * A fetched page as a model reads it (→ plan 22): lines rather than one run-on
 * paragraph, the page's chrome and comments gone, its main content preferred —
 * fewer tokens for a free tier, and structure the model can see.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'vitest';
import {
	draftFromCard,
	failureCode,
	fetchRecipePage,
	htmlToReadableText,
	IMPORT_UA,
	isBlockedAddress,
	readFetchedPage,
	RecipeImportError
} from './recipe-import';

const article = `
	<h1>Linsencurry</h1>
	<p>Ein schnelles Curry für unter der Woche, das auch am nächsten Tag noch gut schmeckt und sich prima einfrieren lässt — perfekt für Meal-Prep.</p>
	<h2>Zutaten</h2>
	<ul><li>200 g rote Linsen</li><li>1 Dose Kokosmilch</li><li>2 EL Currypaste</li></ul>
	<h2>Zubereitung</h2>
	<ol><li>Currypaste 2 Minuten anrösten.</li><li>Linsen &amp; Kokosmilch dazu, 20 Minuten köcheln.</li></ol>
	<p>Dazu passt Reis oder Fladenbrot. Wer es schärfer mag, gibt eine Chili dazu; wer es milder mag, etwas mehr Kokosmilch.</p>`;

describe('htmlToReadableText', () => {
	it('keeps headings and list items on lines of their own', () => {
		const text = htmlToReadableText(`<html><body>${article}</body></html>`);
		const lines = text.split('\n');

		assert.ok(lines.includes('Zutaten'));
		assert.ok(lines.includes('200 g rote Linsen'));
		assert.ok(lines.includes('Linsen & Kokosmilch dazu, 20 Minuten köcheln.'));
	});

	it('drops the page’s chrome, scripts and comment section', () => {
		const text = htmlToReadableText(`<html><head><title>T</title><style>p{}</style></head><body>
			<nav>Home · Rezepte · Login</nav>
			<header>Kochblog</header>
			${article}
			<section id="comments"><p>Super Rezept!!! Besucht meinen Blog</p></section>
			<div class="wp-comment-list"><p>Zu scharf.</p></div>
			<script>track()</script>
			<footer>Impressum</footer>
		</body></html>`);

		for (const gone of [
			'Home',
			'Kochblog',
			'Super Rezept',
			'Zu scharf',
			'track()',
			'Impressum',
			'p{}'
		]) {
			assert.ok(!text.includes(gone), `still has ${gone}`);
		}
		assert.ok(text.includes('2 EL Currypaste'));
	});

	it('prefers <main> or <article> when it holds the content', () => {
		const text = htmlToReadableText(`<html><body>
			<div class="sidebar">Beliebt: Schnitzel, Gulasch, Strudel</div>
			<main>${article}</main>
		</body></html>`);
		assert.ok(!text.includes('Beliebt'));
		assert.ok(text.includes('Zubereitung'));
	});

	it('ignores a <main> too thin to be the content', () => {
		const text = htmlToReadableText(
			`<html><body><main><img alt=""></main><div>${article}</div></body></html>`
		);
		assert.ok(text.includes('200 g rote Linsen'));
	});
});

/** Which reader found the card — what `npm run import:probe` reports (→ plan 25). */
describe('readFetchedPage — a card with the whole recipe in one row (→ plan 44)', () => {
	const blob = `Zutaten ${'1 kg speckige Erdäpfel 50 ml Essig 500 ml heißes Wasser '.repeat(6)}`;
	const card = `<script type="application/ld+json">${JSON.stringify({
		'@type': 'Recipe',
		name: 'Erdäpfelsalat',
		recipeIngredient: [blob]
	})}</script>`;

	it('is no card, so a model reads the page (cookingcatrin.at)', () => {
		assert.equal(readFetchedPage({ html: card, finalUrl: 'https://x.test/' }).card, null);
	});

	it('is a card when the plugin markup has its method', () => {
		const html = `${card}<div class="wprm-recipe-instructions"><li>Erdäpfel kochen.</li></div>`;
		const page = readFetchedPage({ html, finalUrl: 'https://x.test/' });
		assert.deepEqual(page.card?.steps, ['Erdäpfel kochen.']);
	});
});

describe('readFetchedPage', () => {
	const read = (body: string) =>
		readFetchedPage({ html: `<html><body>${body}</body></html>`, finalUrl: 'https://x.test/r' });

	it('names JSON-LD when the page has a JSON-LD card', () => {
		const page = read(
			`<script type="application/ld+json">{"@type":"Recipe","name":"Gulasch","recipeIngredient":["1 kg Rindfleisch"]}</script>`
		);
		assert.equal(page.reader, 'json-ld');
		assert.equal(page.card?.name, 'Gulasch');
	});

	it('names Microdata when only Microdata carries the card', () => {
		const page = read(
			`<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Strudel</h1><li itemprop="recipeIngredient">6 Äpfel</li></div>`
		);
		assert.equal(page.reader, 'microdata');
		assert.equal(page.card?.name, 'Strudel');
	});

	it('reads a JSON-LD card’s missing method from the plugin markup on the page', () => {
		const page = read(
			`<script type="application/ld+json">{"@type":"Recipe","name":"Pierogi","recipeIngredient":["1 Zwiebel"]}</script>
			<div class="e-instructions"><p>Zwiebel anbraten.</p><p>1. Pierogi dazu.</p></div>`
		);
		assert.deepEqual(page.card?.steps, ['Zwiebel anbraten.', 'Pierogi dazu.']);
	});

	it('names no reader when there is no card', () => {
		const page = read(article);
		assert.equal(page.reader, null);
		assert.equal(page.card, null);
		assert.ok(page.text.includes('Zutaten'));
	});
});

/**
 * The SSRF guard's address check. An IPv4 address can ride inside an IPv6 one,
 * and the URL parser writes `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]` — hex, no
 * dots — which the old dotted-only check let through to loopback.
 */
describe('isBlockedAddress', () => {
	it('refuses private IPv4 however IPv6 wraps it', () => {
		for (const ip of [
			'::ffff:127.0.0.1',
			'::ffff:7f00:1',
			'::ffff:a9fe:a9fe',
			'::ffff:c0a8:101',
			'::7f00:1',
			'::ffff:0:7f00:1',
			'64:ff9b::7f00:1',
			'64:ff9b::169.254.169.254',
			'2002:7f00:1::'
		]) {
			assert.equal(isBlockedAddress(ip), true, ip);
		}
	});

	it('lets a public IPv4 through the same wrappers', () => {
		for (const ip of ['::ffff:5db8:d822', '::ffff:93.184.216.34', '64:ff9b::5db8:d822']) {
			assert.equal(isBlockedAddress(ip), false, ip);
		}
	});

	it('keeps the plain IPv6 rules', () => {
		for (const ip of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', 'nonsense']) {
			assert.equal(isBlockedAddress(ip), true, ip);
		}
		assert.equal(isBlockedAddress('2606:4700::6810:84e5'), false);
	});
});

describe('fetchRecipePage', () => {
	it('refuses a mapped loopback URL before any request is made', async () => {
		let requests = 0;
		const server = createServer((_request, response) => {
			requests++;
			response.setHeader('content-type', 'text/html');
			response.end('<h1>internal</h1>');
		});
		await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
		const { port } = server.address() as { port: number };

		try {
			for (const host of ['127.0.0.1', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]']) {
				await assert.rejects(
					fetchRecipePage(`http://${host}:${port}/`),
					(error) => error instanceof RecipeImportError && error.code === 'blocked',
					host
				);
			}
			assert.equal(requests, 0);
		} finally {
			server.close();
		}
	});
});

describe('IMPORT_UA (→ plan 44, DECISIONS #322)', () => {
	it('says what it is and does not claim to be a browser', () => {
		// Cloudflare challenged "Chrome" that did not talk like Chrome
		// (sallysbakingaddiction.com, 2026-11-23); the same request saying what it
		// is was let through.
		assert.match(IMPORT_UA, /^Mozilla\/5\.0 \(compatible; Haushaltsheld/);
		assert.doesNotMatch(IMPORT_UA, /Chrome|Safari|Firefox|Gecko/);
	});
});

describe('failureCode', () => {
	const answer = (status: number, headers: Record<string, string> = {}) =>
		failureCode(new Response(null, { status, headers }));

	it('calls a site that turns the server away refused, not unreachable', () => {
		for (const status of [401, 402, 403, 429]) assert.equal(answer(status), 'refused', `${status}`);
		assert.equal(answer(503, { 'cf-mitigated': 'challenge' }), 'refused');
	});

	it('keeps a missing or broken page unreachable', () => {
		for (const status of [404, 410, 500, 502, 503]) {
			assert.equal(answer(status), 'unreachable', `${status}`);
		}
	});
});

describe('draftFromCard — suggested tags (→ plan 41)', () => {
	const card = {
		name: 'Kürbissuppe',
		timeMinutes: 40,
		servings: 4,
		ingredientLines: ['1 Kürbis'],
		ingredientSections: [null],
		steps: ['Kochen.'],
		stepSections: [null],
		image: null
	};

	it('suggests what the page’s category, keywords and diet name', () => {
		const draft = draftFromCard(
			{ ...card, labels: ['Suppe', 'vegan, schnell', 'https://schema.org/GlutenFreeDiet'] },
			null
		);
		assert.deepEqual(draft.suggested, {
			tags: ['kind:soup', 'free:gluten'],
			diet: 'vegan',
			from: 'page'
		});
	});

	it('suggests nothing when the page names nothing on the list', () => {
		assert.equal(draftFromCard({ ...card, labels: ['Herbst', 'schnell'] }, null).suggested, null);
		assert.equal(draftFromCard({ ...card, labels: [] }, null).suggested, null);
	});
});

describe('draftFromCard — parts (→ plan 44)', () => {
	it('carries the parts the readers found into the draft', () => {
		const draft = draftFromCard(
			{
				name: 'Lasagne',
				timeMinutes: null,
				servings: 4,
				ingredientLines: ['1 Zwiebel', '50 g Butter'],
				ingredientSections: ['Bolognese', 'Béchamel'],
				steps: ['Anbraten.', 'Butter schmelzen.'],
				stepSections: ['Bolognese', 'Béchamel'],
				image: null,
				labels: []
			},
			null
		);
		assert.deepEqual(draft.ingredientSections, ['Bolognese', 'Béchamel']);
		assert.deepEqual(
			draft.steps.map((step) => step.section),
			['Bolognese', 'Béchamel']
		);
	});
});
