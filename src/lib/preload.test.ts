import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { preloadData } from './preload.ts';

describe('preloadData', () => {
	it('holds Home back until a tap, query and all', () => {
		assert.equal(preloadData('/home'), 'tap');
		assert.equal(preloadData('/home?raccoon=tea'), 'tap');
	});

	it('never preloads the album, whose load uses up its "New"', () => {
		assert.equal(preloadData('/settings/raccoons'), 'off');
		assert.equal(preloadData('/settings/raccoons?card=tea&from=home'), 'off');
	});

	it('leaves every other link to the app-wide hover', () => {
		assert.equal(preloadData('/settings'), undefined);
		assert.equal(preloadData('/shopping'), undefined);
	});
});
