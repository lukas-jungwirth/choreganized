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
			.filter((file) => !file.text.includes('requireMember('))
			.map((file) => file.path);

		assert.deepEqual(missing, [], 'Start every load and action with `requireMember(event)`.');
	});

	it('every JSON endpoint is guarded, unless listed as public here', () => {
		const missing = sourceFiles('src/routes/api', ['+server.ts'])
			.filter((file) => !PUBLIC_ENDPOINTS.includes(file.path))
			.filter((file) => !/require(Member|User)(Api)?\(/.test(file.text))
			.map((file) => file.path);

		assert.deepEqual(missing, [], 'JSON endpoints answer with `requireMemberApi(event)` (→ #89).');
	});

	it('onboarding is for signed-in users', () => {
		const missing = sourceFiles('src/routes/onboarding', ['+layout.server.ts'])
			.filter((file) => !file.text.includes('requireUser('))
			.map((file) => file.path);

		assert.deepEqual(missing, []);
	});
});
