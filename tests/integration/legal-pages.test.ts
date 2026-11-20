/**
 * Impressum and Datenschutz come from the deploy (→ SPEC §13, server/legal.ts):
 * unset, the page is a 404 and sign-in shows no link; set, both appear. The
 * e2e server always has both set, so the unset half lives here, where the
 * environment can change between two calls of the same `load`.
 */
import assert from 'node:assert/strict';
import { isHttpError } from '@sveltejs/kit';
import { afterEach, describe, it, vi } from 'vitest';

const overrides = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', async (importOriginal) => {
	const { env } = await importOriginal<typeof import('$env/dynamic/private')>();
	return {
		env: new Proxy(env, {
			get: (target, key: string) => (key in overrides ? overrides[key] : target[key])
		})
	};
});

const { load: legalLoad } = await import('../../src/routes/legal/[page=legal]/+page.server');
const { load: loginLoad } = await import('../../src/routes/login/+page.server');

type LegalEvent = Parameters<typeof legalLoad>[0];
type LoginEvent = Parameters<typeof loginLoad>[0];

/** What the two loads return here: both are synchronous, the generated type isn't. */
type LegalData = {
	blocks: unknown;
	back: string;
	other: { page: string; href: string } | null;
};
type LoginData = { legal: { imprint: boolean; privacy: boolean } };

function openLegal(page: string, query = '', member = false): LegalData {
	return legalLoad({
		params: { page },
		url: new URL(`http://localhost/legal/${page}${query}`),
		locals: { user: null, member: member ? { id: 'm' } : null }
	} as unknown as LegalEvent) as unknown as LegalData;
}

function openLogin(): LoginData {
	return loginLoad({
		url: new URL('http://localhost/login'),
		locals: { user: null, member: null }
	} as unknown as LoginEvent) as unknown as LoginData;
}

function statusOf(run: () => unknown): number | undefined {
	try {
		run();
	} catch (error) {
		if (isHttpError(error)) return error.status;
		throw error;
	}
	return undefined;
}

afterEach(() => {
	for (const key of Object.keys(overrides)) delete overrides[key];
});

describe('legal pages, unset', () => {
	it('are a 404, and sign-in links to neither', () => {
		overrides.LEGAL_IMPRINT = undefined;
		overrides.LEGAL_PRIVACY = '   ';

		assert.equal(
			statusOf(() => openLegal('imprint')),
			404
		);
		assert.equal(
			statusOf(() => openLegal('privacy')),
			404
		);
		assert.deepEqual(openLogin().legal, { imprint: false, privacy: false });
	});
});

describe('legal pages, set', () => {
	it('show the operator’s text, and sign-in links to both', () => {
		overrides.LEGAL_IMPRINT = 'Erika Musterfrau\\nMusterstadt';
		overrides.LEGAL_PRIVACY = '## Hosting\nEigener Server.';

		const imprint = openLegal('imprint');
		assert.deepEqual(imprint?.blocks, [
			{
				kind: 'paragraph',
				lines: [
					[{ kind: 'text', text: 'Erika Musterfrau' }],
					[{ kind: 'text', text: 'Musterstadt' }]
				]
			}
		]);
		assert.deepEqual(imprint?.other, { page: 'privacy', href: '/legal/privacy' });
		assert.deepEqual(openLogin().legal, { imprint: true, privacy: true });
	});

	it('exist one at a time: no cross-link to a page that isn’t set', () => {
		overrides.LEGAL_IMPRINT = 'Erika Musterfrau';
		overrides.LEGAL_PRIVACY = '';

		assert.equal(openLegal('imprint').other, null);
		assert.equal(
			statusOf(() => openLegal('privacy')),
			404
		);
		assert.deepEqual(openLogin().legal, { imprint: true, privacy: false });
	});

	it('lead back where the reader came from, and nowhere else', () => {
		overrides.LEGAL_IMPRINT = 'x';
		overrides.LEGAL_PRIVACY = 'y';

		assert.equal(openLegal('imprint', '?from=login').back, '/login');
		assert.equal(openLegal('imprint', '?from=settings').back, '/settings');
		assert.equal(openLegal('imprint', '?from=invite-7K4P2X').back, '/j/7K4P2X');
		// The cross-link keeps where the reader started.
		assert.equal(
			openLegal('imprint', '?from=invite-7K4P2X').other?.href,
			'/legal/privacy?from=invite-7K4P2X'
		);
		// Unknown → Settings for a member, sign-in for anyone else; never the value.
		assert.equal(openLegal('privacy', '?from=https://evil.example').back, '/login');
		assert.equal(openLegal('privacy', '?from=//evil.example', true).back, '/settings');
		assert.equal(openLegal('privacy', '?from=//evil.example').other?.href, '/legal/imprint');
	});
});
