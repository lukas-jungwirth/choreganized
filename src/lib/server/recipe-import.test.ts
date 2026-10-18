/**
 * A fetched page as a model reads it (→ plan 22): lines rather than one run-on
 * paragraph, the page's chrome and comments gone, its main content preferred —
 * fewer tokens for a free tier, and structure the model can see.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { htmlToReadableText } from './recipe-import';

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
