/**
 * Where a legal page's back chevron leads (→ legal.ts): only known places,
 * never an address taken from the query.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { guestFrom, inviteFrom, legalBack, legalHref, parseLegalFrom } from './legal';

describe('parseLegalFrom', () => {
	it('knows Settings, sign-in and an invite landing', () => {
		assert.equal(parseLegalFrom('settings'), 'settings');
		assert.equal(parseLegalFrom('login'), 'login');
		assert.equal(parseLegalFrom('invite-7K4P2X'), 'invite-7K4P2X');
	});

	it('knows a guest’s page by its 43-character token (→ SPEC §11.15)', () => {
		const token = 'a'.repeat(40) + '_-Z';
		assert.equal(parseLegalFrom(`guest-${token}`), `guest-${token}`);
		assert.equal(guestFrom(token), `guest-${token}`);
		assert.equal(legalBack(`guest-${token}`, false), `/g/${token}`);
		assert.equal(parseLegalFrom(`guest-${token}x`), null);
		assert.equal(parseLegalFrom('guest-short'), null);
		assert.equal(parseLegalFrom(`guest-${'a'.repeat(40)}/..`), null);
	});

	it('is null for anything else, including addresses', () => {
		for (const value of [
			null,
			undefined,
			'',
			'home',
			'Settings',
			'/settings',
			'https://evil.example',
			'//evil.example',
			'invite-',
			'invite-7k4p2x',
			'invite-7K4P2X/../../x',
			'invite-7K4P2XX',
			'invite-OOOOOO'
		]) {
			assert.equal(parseLegalFrom(value), null, String(value));
		}
	});
});

describe('legalBack', () => {
	it('goes back where the link was', () => {
		assert.equal(legalBack('settings', false), '/settings');
		assert.equal(legalBack('login', true), '/login');
		assert.equal(legalBack('invite-7K4P2X', false), '/j/7K4P2X');
	});

	it('guesses Settings for a member and sign-in for anyone else', () => {
		assert.equal(legalBack(null, true), '/settings');
		assert.equal(legalBack(null, false), '/login');
	});

	it('falls back the same way for an unknown from', () => {
		assert.equal(legalBack(parseLegalFrom('https://evil.example'), false), '/login');
	});
});

describe('legalHref', () => {
	it('carries the from, or nothing', () => {
		assert.equal(legalHref('privacy', 'login'), '/legal/privacy?from=login');
		assert.equal(legalHref('imprint', null), '/legal/imprint');
		assert.equal(legalHref('imprint', inviteFrom('7K4P2X')), '/legal/imprint?from=invite-7K4P2X');
	});

	it('drops an invite code that is not one', () => {
		assert.equal(inviteFrom('nope'), null);
	});
});
