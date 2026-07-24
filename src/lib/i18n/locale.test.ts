/**
 * `npm test` — plain `node --test` (→ docs/plans/08-cook-mode.md).
 *
 * Worth having as tests rather than as a walkthrough: `negotiateLocale` decides
 * what language somebody sees *before* they have ever opened Settings, and the
 * cases that matter are headers you can't produce by clicking around — a
 * weighted list, a `q=0` refusal, a wildcard, a regional tag we don't ship.
 * Getting one wrong shows up as "the app is in the wrong language for people I
 * can't reproduce", which is the worst kind of bug to chase.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { negotiateLocale } from './locale.ts';

describe('negotiateLocale', () => {
	it('matches a regional tag to the language we ship', () => {
		// The whole point: we ship `de`, phones ask for `de-AT` / `de-CH` / `de-DE`.
		assert.equal(negotiateLocale('de-AT'), 'de');
		assert.equal(negotiateLocale('de-CH,de;q=0.9'), 'de');
		assert.equal(negotiateLocale('en-GB'), 'en');
		assert.equal(negotiateLocale('en-US,en;q=0.9'), 'en');
	});

	it('takes the highest weight, not the first entry', () => {
		assert.equal(negotiateLocale('en;q=0.5,de;q=0.9'), 'de');
		assert.equal(negotiateLocale('de;q=0.2,en;q=0.8'), 'en');
	});

	it('keeps the header order when weights tie', () => {
		// Both default to q=1, so the leftmost wins (RFC 9110 §12.5.4).
		assert.equal(negotiateLocale('de,en'), 'de');
		assert.equal(negotiateLocale('en,de'), 'en');
		assert.equal(negotiateLocale('de;q=0.8,en;q=0.8'), 'de');
	});

	it('reads a real browser header', () => {
		assert.equal(negotiateLocale('de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7'), 'de');
		assert.equal(negotiateLocale('en-GB,en;q=0.9,de;q=0.8'), 'en');
	});

	it('treats q=0 as a refusal rather than a weak preference', () => {
		assert.equal(negotiateLocale('de;q=0,en;q=0.1'), 'en');
		assert.equal(negotiateLocale('de;q=0'), null);
		assert.equal(negotiateLocale('de;q=0.0,en;q=0'), null);
	});

	it('skips languages we do not ship', () => {
		assert.equal(negotiateLocale('fr-FR,fr;q=0.9'), null);
		assert.equal(negotiateLocale('fr;q=0.9,de;q=0.8'), 'de');
		assert.equal(negotiateLocale('ja,ko;q=0.9,de;q=0.1'), 'de');
	});

	it('only falls back to the wildcard once nothing named matched', () => {
		// The regression this guards: honouring `*` by rank answered a header that
		// explicitly asked for German — and that we speak — in English.
		assert.equal(negotiateLocale('de;q=0.5,*;q=0.9'), 'de');
		assert.equal(negotiateLocale('fr;q=0.9,*;q=0.1'), 'en');
		assert.equal(negotiateLocale('*'), 'en');
	});

	it('answers nothing for a header that says nothing', () => {
		assert.equal(negotiateLocale(null), null);
		assert.equal(negotiateLocale(undefined), null);
		assert.equal(negotiateLocale(''), null);
		assert.equal(negotiateLocale('   '), null);
	});

	it('survives a malformed header instead of throwing', () => {
		// A broken weight is a broken entry, not a preference — it drops out, and
		// whatever else the header asked for still gets a fair hearing.
		assert.equal(negotiateLocale('de;q=abc,en'), 'en');
		assert.equal(negotiateLocale('de;q=,en;q=0.5'), 'en');
		assert.equal(negotiateLocale(';;;'), null);
		assert.equal(negotiateLocale(',,'), null);
		assert.equal(negotiateLocale('de;;q=0.9'), 'de');
	});

	it('ignores case and stray whitespace', () => {
		assert.equal(negotiateLocale('DE-at'), 'de');
		assert.equal(negotiateLocale('  en-GB , de ; q=0.9  '), 'en');
	});
});
