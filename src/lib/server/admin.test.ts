/**
 * Who is an admin (→ admin.ts, plan 34). The list is the deploy's, the address
 * has to be verified, and an empty list is nobody, not everybody.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { adminEmails, isAdminBy } from './admin';

const LIST = adminEmails(' Lukas@Example.test , ,second@example.test');
const lukas = { email: 'lukas@example.test', emailVerified: true };

describe('adminEmails', () => {
	it('splits on commas, ignoring case, spaces and blanks', () => {
		assert.deepEqual([...LIST], ['lukas@example.test', 'second@example.test']);
	});
});

describe('isAdminBy', () => {
	it('lets in a verified address on the list, whatever its case', () => {
		assert.equal(isAdminBy(lukas, LIST, false), true);
		assert.equal(isAdminBy({ ...lukas, email: 'LUKAS@example.test' }, LIST, false), true);
	});

	it('keeps out an address not on the list', () => {
		assert.equal(isAdminBy({ ...lukas, email: 'someone@example.test' }, LIST, false), false);
	});

	it('makes nobody an admin while the list is unset or empty', () => {
		assert.equal(isAdminBy(lukas, adminEmails(undefined), false), false);
		assert.equal(isAdminBy(lukas, adminEmails(' , '), false), false);
	});

	it('refuses an unverified address unless the server is in E2E mode', () => {
		const unverified = { ...lukas, emailVerified: false };
		assert.equal(isAdminBy(unverified, LIST, false), false);
		assert.equal(isAdminBy(unverified, LIST, true), true);
	});

	it('is false for nobody signed in', () => {
		assert.equal(isAdminBy(null, LIST, true), false);
	});
});
