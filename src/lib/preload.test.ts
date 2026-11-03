import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { preloadData } from './preload.ts';

describe('preloadData', () => {
	it('holds back the pages whose load writes, query and all', () => {
		assert.equal(preloadData('/home'), 'tap');
		assert.equal(preloadData('/settings/raccoons?card=tea'), 'tap');
	});

	it('leaves every other link to the app-wide hover', () => {
		assert.equal(preloadData('/settings'), undefined);
		assert.equal(preloadData('/shopping'), undefined);
	});
});
