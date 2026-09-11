/**
 * Reading the source tree for the convention tests (→ tests/conventions).
 * Plain `fs`, no parser: the rules are about text the way `grep` sees it, and
 * the point is that an agent can reproduce a failure with one grep.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ROOT = process.cwd();

export type SourceFile = { path: string; text: string };

/** Every file under `dir` (relative to the repo root) with one of `extensions`. */
export function sourceFiles(dir: string, extensions: string[]): SourceFile[] {
	return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
		.map((entry) => {
			const full = join(entry.parentPath, entry.name);
			return { path: relative(ROOT, full), text: readFileSync(full, 'utf8') };
		})
		.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A Svelte file reduced to its `<style>` blocks, everything else blanked —
 * newlines kept, so a line number in the result is a line number in the file.
 */
export function styleOnly(svelte: string): string {
	const blank = (text: string) => text.replace(/[^\n]/g, ' ');
	let out = '';
	let cursor = 0;
	for (const match of svelte.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
		const start = match.index + match[0].indexOf(match[1]);
		out += blank(svelte.slice(cursor, start)) + stripCss(match[1]);
		cursor = start + match[1].length;
	}
	return out + blank(svelte.slice(cursor));
}

/** A stylesheet with its `/* … *\/` comments blanked out (line numbers kept). */
export function stripCss(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** `path:line  <the line>` for every line of the file matching `pattern`. */
export function linesMatching(file: SourceFile, pattern: RegExp): string[] {
	return file.text
		.split('\n')
		.map((line, index) => (pattern.test(line) ? `${file.path}:${index + 1}  ${line.trim()}` : null))
		.filter((hit): hit is string => hit !== null);
}
