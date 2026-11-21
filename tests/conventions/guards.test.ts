/**
 * "Household scoping — `(app)` loads/actions start with `requireMember(event)`
 * … No exceptions, including uploads" (CLAUDE.md, ARCHITECTURE "Server
 * patterns", DECISIONS #20, #89). A route file that forgets the guard is a
 * cross-household read waiting to happen, and nothing at runtime would notice.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { sourceFiles } from '../helpers/source';

/** Endpoints that are public by design. Every addition needs a reason here. */
const PUBLIC_ENDPOINTS = [
	// Better Auth owns sign-in; the hook hands it the request before any guard.
	'src/routes/api/auth/[...all]/+server.ts',
	// Liveness for the smoke test and uptime checks; says nothing household-specific.
	'src/routes/api/health/+server.ts'
];

describe('route guards', () => {
	it('every (app) server file calls requireMember', () => {
		// `+server.ts` too: an endpoint colocated with its screen is still inside
		// the household, and neither the layout guard nor the api test sees it.
		const missing = sourceFiles('src/routes/(app)', [
			'+page.server.ts',
			'+layout.server.ts',
			'+server.ts'
		])
			// `requireAdmin` calls `requireMember` first, so it counts (→ plan 34).
			.filter((file) => !/require(Member|Admin)\(/.test(file.text))
			.map((file) => file.path);

		assert.deepEqual(missing, [], 'Start every load and action with `requireMember(event)`.');
	});

	it('every admin server file calls requireAdmin', () => {
		// `requireMember` alone would let any member read every household's
		// numbers (→ plan 34): the admin screens are the one cross-household read.
		const missing = sourceFiles('src/routes/(app)/admin', [
			'+page.server.ts',
			'+layout.server.ts',
			'+server.ts'
		])
			.filter((file) => !file.text.includes('requireAdmin('))
			.map((file) => file.path);

		assert.deepEqual(missing, [], 'Every admin load and action calls `requireAdmin(event)`.');
	});

	it('every JSON endpoint is guarded, unless listed as public here', () => {
		const missing = sourceFiles('src/routes/api', ['+server.ts'])
			.filter((file) => !PUBLIC_ENDPOINTS.includes(file.path))
			.filter((file) => !/require(Member|User)(Api)?\(/.test(file.text))
			.map((file) => file.path);

		assert.deepEqual(missing, [], 'JSON endpoints answer with `requireMemberApi(event)` (→ #89).');
	});

	it('every page outside (app) and onboarding is public by design, and listed here', () => {
		// A page the household guard doesn't cover is readable by anyone with the
		// address. That has to be a decision, not an accident of where it was put.
		const PUBLIC_PAGES: Record<string, string> = {
			'src/routes/+page.svelte': 'redirects to sign-in, onboarding or home',
			'src/routes/login/+page.svelte': 'the way in',
			'src/routes/j/[code]/+page.svelte': 'an invite link is opened before sign-in',
			'src/routes/dev/kit/+page.svelte': 'component gallery; 404 unless dev or E2E mode',
			// The sign-in screen links here, before anyone has an account (→ SPEC §13).
			// The text is the operator's, from the deploy; nothing household-specific.
			'src/routes/legal/[page=legal]/+page.svelte': 'Impressum and Datenschutz',
			// A guest has no account (→ SPEC §11.15): the link is the key. The page
			// reads only that guest's own share and balance, from the token alone.
			'src/routes/g/[token]/+page.svelte': 'a guest’s read-only page, opened from their link'
		};
		const unlisted = sourceFiles('src/routes', ['+page.svelte'])
			.map((file) => file.path)
			.filter((path) => !path.startsWith('src/routes/(app)/'))
			.filter((path) => !path.startsWith('src/routes/onboarding/'))
			.filter((path) => !(path in PUBLIC_PAGES));

		assert.deepEqual(unlisted, [], 'Put the page in (app), or list it here with the reason.');
	});

	it('onboarding is for signed-in users', () => {
		const missing = sourceFiles('src/routes/onboarding', ['+layout.server.ts'])
			.filter((file) => !file.text.includes('requireUser('))
			.map((file) => file.path);

		assert.deepEqual(missing, []);
	});
});
