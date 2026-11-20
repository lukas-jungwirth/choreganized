/**
 * The operator's legal text → blocks (→ legal-text.ts). What matters most is
 * at the bottom: nothing in the text can become markup or a script link.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { linkify, parseLegalText } from './legal-text';

const text = (value: string) => ({ kind: 'text', text: value });

describe('parseLegalText', () => {
	it('splits paragraphs on blank lines and keeps the line breaks inside one', () => {
		assert.deepEqual(
			parseLegalText('Erika Musterfrau\nMusterstraße 1\n1234 Musterstadt\n\nA private site.'),
			[
				{
					kind: 'paragraph',
					lines: [[text('Erika Musterfrau')], [text('Musterstraße 1')], [text('1234 Musterstadt')]]
				},
				{ kind: 'paragraph', lines: [[text('A private site.')]] }
			]
		);
	});

	it('reads `## ` as a heading, with or without a blank line after it', () => {
		assert.deepEqual(parseLegalText('## Kontakt\nPer Mail.\n\n## Hosting\n\nEigener Server.'), [
			{ kind: 'heading', text: 'Kontakt' },
			{ kind: 'paragraph', lines: [[text('Per Mail.')]] },
			{ kind: 'heading', text: 'Hosting' },
			{ kind: 'paragraph', lines: [[text('Eigener Server.')]] }
		]);
	});

	it('gathers `- ` lines into one list, and a plain line under an item continues it', () => {
		assert.deepEqual(parseLegalText('Cookies:\n- session\n- language\n  per device\n- theme'), [
			{ kind: 'paragraph', lines: [[text('Cookies:')]] },
			{
				kind: 'list',
				items: [[[text('session')]], [[text('language')], [text('per device')]], [[text('theme')]]]
			}
		]);
	});

	it('takes a literal \\n as a line break, so a one-line variable still works', () => {
		assert.deepEqual(parseLegalText('## Impressum\\nErika Musterfrau\\nMusterstadt\\n\\nEnde.'), [
			{ kind: 'heading', text: 'Impressum' },
			{ kind: 'paragraph', lines: [[text('Erika Musterfrau')], [text('Musterstadt')]] },
			{ kind: 'paragraph', lines: [[text('Ende.')]] }
		]);
	});

	it('accepts Windows line ends and ignores leading and trailing blank lines', () => {
		assert.deepEqual(parseLegalText('\r\n\r\nOne\r\nTwo\r\n\r\n'), [
			{ kind: 'paragraph', lines: [[text('One')], [text('Two')]] }
		]);
	});

	it('is nothing for blank text', () => {
		assert.deepEqual(parseLegalText('  \n\n \\n '), []);
	});
});

describe('linkify', () => {
	it('links a web address, leaving the sentence’s full stop outside it', () => {
		assert.deepEqual(linkify('See https://example.com/datenschutz.'), [
			text('See '),
			{
				kind: 'link',
				text: 'https://example.com/datenschutz',
				href: 'https://example.com/datenschutz',
				external: true
			},
			text('.')
		]);
	});

	it('links an email address as mailto:', () => {
		assert.deepEqual(linkify('Mail: kontakt@example.com, any time'), [
			text('Mail: '),
			{
				kind: 'link',
				text: 'kontakt@example.com',
				href: 'mailto:kontakt@example.com',
				external: false
			},
			text(', any time')
		]);
	});

	it('finds several on one line', () => {
		const parts = linkify('https://a.example and b@example.org');
		assert.deepEqual(
			parts.map((part) => part.kind),
			['link', 'text', 'link']
		);
	});

	it('leaves a line with nothing to link as one run of text', () => {
		assert.deepEqual(linkify('Erika Musterfrau'), [text('Erika Musterfrau')]);
	});
});

describe('nothing in the text can run', () => {
	it('keeps HTML as text: no element, no link', () => {
		const blocks = parseLegalText(
			'<script>alert(1)</script>\n<a href="https://evil.example">x</a>'
		);
		assert.equal(blocks.length, 1);
		const [block] = blocks;
		assert.equal(block.kind, 'paragraph');
		if (block.kind !== 'paragraph') return;
		assert.deepEqual(block.lines[0], [text('<script>alert(1)</script>')]);
		// The address inside the attribute is found — but only as an http link,
		// shown as its own text; the tag around it stays plain text.
		for (const part of block.lines[1]) {
			if (part.kind === 'link') assert.match(part.href, /^https:\/\//);
		}
		assert.equal(block.lines[1][0].kind, 'text');
	});

	it('never makes a link of javascript:, data: or any other scheme', () => {
		for (const line of [
			'javascript:alert(1)',
			'JavaScript:alert(document.cookie)',
			'data:text/html,<script>alert(1)</script>',
			'vbscript:msgbox(1)',
			'ftp://example.com/file'
		]) {
			assert.deepEqual(linkify(line), [text(line)], line);
		}
	});

	it('only ever produces http(s) and mailto hrefs', () => {
		const blocks = parseLegalText(
			'## <b>x</b>\n- javascript:https://ok.example\n- mailto:a@example.com\n\nhttp://x.example"onmouseover="alert(1)'
		);
		const hrefs = blocks.flatMap((block) =>
			block.kind === 'heading'
				? []
				: (block.kind === 'list' ? block.items.flat() : block.lines)
						.flat()
						.flatMap((part) => (part.kind === 'link' ? [part.href] : []))
		);
		assert.ok(hrefs.length > 0);
		for (const href of hrefs) assert.match(href, /^(https?:\/\/|mailto:)[^"<>\s]+$/);
	});
});
