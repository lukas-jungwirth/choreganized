/**
 * A legal page exists only while its variable has text (→ legal.ts): unset or
 * blank, it is a 404 and every link to it is hidden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { legalLangFrom, legalLinksFrom, legalTextFrom } from './legal';

describe('legalTextFrom', () => {
	it('is null while the variable is unset, empty or only whitespace', () => {
		assert.equal(legalTextFrom({}, 'imprint'), null);
		assert.equal(legalTextFrom({ LEGAL_IMPRINT: '' }, 'imprint'), null);
		assert.equal(legalTextFrom({ LEGAL_IMPRINT: ' \n\t ' }, 'imprint'), null);
		assert.equal(legalTextFrom({ LEGAL_IMPRINT: '\\n\\n' }, 'imprint'), null);
	});

	it('is the text exactly as set', () => {
		const value = 'Erika Musterfrau\\nMusterstadt';
		assert.equal(legalTextFrom({ LEGAL_IMPRINT: value }, 'imprint'), value);
	});

	it('reads each page from its own variable', () => {
		assert.equal(legalTextFrom({ LEGAL_IMPRINT: 'x' }, 'privacy'), null);
		assert.equal(legalTextFrom({ LEGAL_PRIVACY: 'y' }, 'privacy'), 'y');
	});
});

describe('legalLinksFrom', () => {
	it('shows each link only for a page that exists, independently', () => {
		assert.deepEqual(legalLinksFrom({}), { imprint: false, privacy: false });
		assert.deepEqual(legalLinksFrom({ LEGAL_IMPRINT: 'x' }), { imprint: true, privacy: false });
		assert.deepEqual(legalLinksFrom({ LEGAL_PRIVACY: 'y' }), { imprint: false, privacy: true });
		assert.deepEqual(legalLinksFrom({ LEGAL_IMPRINT: 'x', LEGAL_PRIVACY: 'y' }), {
			imprint: true,
			privacy: true
		});
	});
});

describe('legalLangFrom', () => {
	it('is German unless the deploy says otherwise', () => {
		assert.equal(legalLangFrom({}), 'de');
		assert.equal(legalLangFrom({ LEGAL_LANG: '' }), 'de');
		assert.equal(legalLangFrom({ LEGAL_LANG: '  ' }), 'de');
	});

	it('takes a language tag as written, trimmed', () => {
		assert.equal(legalLangFrom({ LEGAL_LANG: 'en' }), 'en');
		assert.equal(legalLangFrom({ LEGAL_LANG: ' de-AT ' }), 'de-AT');
	});

	it('falls back to German for anything that is not a language tag', () => {
		for (const value of ['english', 'de_AT', 'en"><script>', 'de AT', '1']) {
			assert.equal(legalLangFrom({ LEGAL_LANG: value }), 'de', value);
		}
	});
});
