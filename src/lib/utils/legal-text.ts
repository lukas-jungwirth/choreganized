/**
 * The operator's Impressum and Datenschutz text (→ SPEC §13, `server/legal.ts`),
 * turned into blocks a Svelte component renders as elements.
 *
 * The text comes from the deploy, not from the app, so it is shown as written:
 * nothing here translates, reflows or "fixes" it. It is also never HTML. There
 * is no `{@html}` on the page, so a `<script>` or a `javascript:` in the text
 * stays text; the only links are the ones this module finds, and it only
 * finds `http(s)://` addresses and email addresses (→ DECISIONS #268).
 *
 * The format, all of it:
 *
 *   - a blank line starts a new block
 *   - `## Heading` (also `#` or `###`) is a heading
 *   - `- item` lines are a list; a line under an item that is not one itself
 *     continues it on a new line
 *   - any other line is part of a paragraph, and its line breaks are kept
 *     (an address is several lines)
 *   - a literal `\n` (backslash, n) is a line break too, so a value that has
 *     to fit on one line in a deploy's settings can still have several
 */

/** A run of plain text, or a link this module found in it. */
export type Inline =
	{ kind: 'text'; text: string } | { kind: 'link'; text: string; href: string; external: boolean };

/** One line of a paragraph or of a list item. */
export type Line = Inline[];

export type Block =
	| { kind: 'heading'; text: string }
	| { kind: 'paragraph'; lines: Line[] }
	| { kind: 'list'; items: Line[][] };

const HEADING = /^#{1,3}\s+(.*)$/;
const ITEM = /^[-*]\s+(.*)$/;

/**
 * A web address (http or https only) or an email address. Deliberately plain:
 * the text is a few hundred words a person wrote, not untrusted markup, and
 * anything this misses is still shown, just not as a link.
 */
const LINKABLE =
	/(https?:\/\/[^\s<>"']+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

/** What a sentence puts after an address, which is not part of it. */
const TRAILING = /[.,;:!?)\]]+$/;

export function parseLegalText(source: string): Block[] {
	const text = source.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
	const blocks: Block[] = [];

	for (const chunk of text.split(/\n[ \t]*\n/)) {
		let paragraph: Line[] | null = null;
		let list: Line[][] | null = null;

		for (const raw of chunk.split('\n')) {
			const line = raw.trim();
			if (!line) continue;

			const heading = HEADING.exec(line);
			const item = ITEM.exec(line);

			if (heading) {
				paragraph = list = null;
				blocks.push({ kind: 'heading', text: heading[1].trim() });
			} else if (item) {
				paragraph = null;
				if (!list) blocks.push({ kind: 'list', items: (list = []) });
				list.push([linkify(item[1])]);
			} else if (list) {
				list[list.length - 1].push(linkify(line));
			} else {
				if (!paragraph) blocks.push({ kind: 'paragraph', lines: (paragraph = []) });
				paragraph.push(linkify(line));
			}
		}
	}

	return blocks;
}

/** One line → its text and the links found in it, in order. */
export function linkify(line: string): Line {
	const out: Line = [];
	let at = 0;

	for (const match of line.matchAll(LINKABLE)) {
		const found = match[0];
		// "see https://example.com." — the full stop ends the sentence, not the address.
		const trailing = TRAILING.exec(found)?.[0] ?? '';
		const address = found.slice(0, found.length - trailing.length);
		const start = match.index;

		if (start > at) out.push({ kind: 'text', text: line.slice(at, start) });
		out.push(
			match[1]
				? { kind: 'link', text: address, href: address, external: true }
				: { kind: 'link', text: address, href: `mailto:${address}`, external: false }
		);
		at = start + address.length;
	}

	if (at < line.length) out.push({ kind: 'text', text: line.slice(at) });
	return mergeText(out);
}

/** Neighbouring text runs as one, so a line without links is a single run. */
function mergeText(line: Line): Line {
	const merged: Line = [];
	for (const part of line) {
		const last = merged.at(-1);
		if (part.kind === 'text' && last?.kind === 'text') last.text += part.text;
		else merged.push({ ...part });
	}
	return merged;
}
