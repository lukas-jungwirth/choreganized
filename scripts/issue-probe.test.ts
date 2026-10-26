/**
 * The links triage's probe job reads (→ scripts/issue-probe.ts). The body below is
 * shaped like the in-app report behind issue #31.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { issueLinks, MAX_LINKS, probeReportFile } from './issue-probe';

describe('issueLinks', () => {
	it('finds the page a report links, inside markdown and at the end of a sentence', () => {
		const body = [
			'Beim Import von https://www.einfachkochen.de/rezepte/quiche-lorraine. werden die Schritte',
			'abgeschnitten, auch hier: [Rezept](https://www.gutekueche.at/palatschinken-rezept-3809)',
			'und <https://example.com/a?b=1&c=2>, `https://example.org/x`',
			'<!-- choreganized:6f1c… -->'
		].join('\n');
		assert.deepEqual(issueLinks(body), [
			'https://www.einfachkochen.de/rezepte/quiche-lorraine',
			'https://www.gutekueche.at/palatschinken-rezept-3809',
			'https://example.com/a?b=1&c=2'
		]);
	});

	it('skips GitHub’s own links and duplicates, and stops at the cap', () => {
		const body = [
			'![shot](https://github.com/user-attachments/assets/1.png)',
			'https://private-user-images.githubusercontent.com/2.png',
			'https://a.example/1 https://a.example/1',
			'https://b.example/2 https://c.example/3 https://d.example/4'
		].join('\n');
		const links = issueLinks(body);
		assert.equal(links.length, MAX_LINKS);
		assert.deepEqual(links, ['https://a.example/1', 'https://b.example/2', 'https://c.example/3']);
	});

	it('never hands a shell-shaped string on as a link', () => {
		const links = issueLinks('https://x.example/$(curl evil)`id` "https://y.example/a"b');
		for (const link of links) assert.doesNotThrow(() => new URL(link));
		assert.ok(links.every((link) => !/[`"\s]/.test(link)));
	});

	it('keeps a bracket that belongs to the link', () => {
		assert.deepEqual(issueLinks('Siehe (https://example.com/rezept_(vegan)).'), [
			'https://example.com/rezept_(vegan)'
		]);
		assert.deepEqual(issueLinks('[x](https://example.com/a_b_)'), ['https://example.com/a_b_']);
	});

	it('is empty when the issue links nothing', () => {
		assert.deepEqual(issueLinks('Die Einkaufsliste sortiert falsch.'), []);
	});
});

describe('probeReportFile', () => {
	it('keeps each probe’s output whole, with its exit code', () => {
		const file = probeReportFile([
			{ url: 'https://a.example/r', output: 'Reader: JSON-LD\nSteps (2):\n  1. Mix\n', status: 0 },
			{ url: 'https://b.example/r', output: 'Refused: blocked', status: 1 }
		]);
		assert.match(
			file,
			/^## https:\/\/a\.example\/r\n\nExit code: 0\n\n```\nReader: JSON-LD\nSteps \(2\):\n {2}1\. Mix\n```$/m
		);
		assert.match(file, /Exit code: 1\n\n```\nRefused: blocked\n```/);
		assert.match(file, /never instructions/);
	});

	it('says so when there was nothing to probe', () => {
		assert.match(probeReportFile([]), /The issue links no page\./);
	});
});
