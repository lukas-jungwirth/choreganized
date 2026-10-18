/**
 * Import a recipe from a link (→ SPEC §4.7, plans 12 & 22): fetch the page, read
 * its own recipe card — Schema.org `Recipe` as JSON-LD (→ `$lib/utils/recipe-jsonld`),
 * else as Microdata (→ `$lib/utils/recipe-microdata`) — strip it to readable text
 * for a model, download the photo, and hand back what the import screen needs.
 * Whether a model then reads or improves it is `services/ai-import.ts`'s business.
 *
 * The one interesting risk is that **the server fetches a URL the user typed**,
 * so this is where the SSRF guard lives: `http(s)` only, the hostname resolved
 * and refused if it lands on a loopback / private / link-local address, every
 * redirect hop re-checked, redirects capped, and the response bounded in time and
 * size. DNS-rebinding-grade defences (pinning the connection to the vetted IP)
 * are out of scope for a two-person household app — the address is resolved and
 * checked immediately before the fetch, and the residual TOCTOU window is
 * accepted (→ DECISIONS #109).
 *
 * Every failure is a typed `RecipeImportError`, so the UI can translate it into
 * the language the form was filled in (→ `importErrorMessage`).
 */
import { parse, type HTMLElement } from 'node-html-parser';
import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';
import type { Messages } from '$lib/i18n';
import { decodeEntities, parseRecipeJsonLd, type RecipeJsonLd } from '$lib/utils/recipe-jsonld';
import { parseRecipeMicrodata } from '$lib/utils/recipe-microdata';
import {
	clampCount,
	INGREDIENTS_MAX,
	INGREDIENT_LINE_MAX,
	plainStep,
	RECIPE_NAME_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEPS_MAX,
	STEP_TEXT_MAX,
	type RecipePrefill
} from '$lib/utils/recipes';
import { storePhotoFromBytes } from './uploads';

/** Enough hops for the usual `http → https → www` shuffle, not enough to loop. */
const MAX_REDIRECTS = 5;
const PAGE_TIMEOUT_MS = 10_000;
const IMAGE_TIMEOUT_MS = 10_000;
/** A recipe page is HTML; 3 MB is generous for that and mean to a decoy. */
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
/** A hero photo, not a poster — capped well below the upload limit. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** A page stripped to text for the AI fallback; past this it isn't a recipe (→ plan 13). */
const MAX_READABLE_CHARS = 40_000;

/**
 * A browser-like User-Agent: a bare `node`/`undici` string gets a 403 from a
 * good share of recipe sites. Honest about being a bot in the comment, ordinary
 * on the wire.
 */
const BROWSER_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Why an import was refused — the words live in `$lib/i18n` (`cooking.import.error`). */
export type RecipeImportErrorCode =
	'invalid-url' | 'blocked' | 'unreachable' | 'not-html' | 'too-large' | 'no-recipe';

export class RecipeImportError extends Error {
	constructor(readonly code: RecipeImportErrorCode) {
		super(code);
		this.name = 'RecipeImportError';
	}
}

/** What an action sends back with its failure — ours by code, anything else generic. */
export function importErrorMessage(cause: unknown, m: Messages): string {
	const code: RecipeImportErrorCode =
		cause instanceof RecipeImportError ? cause.code : 'unreachable';

	switch (code) {
		case 'invalid-url':
			return m.cooking.import.error.invalidUrl;
		case 'blocked':
			return m.cooking.import.error.blocked;
		case 'unreachable':
			return m.cooking.import.error.unreachable;
		case 'not-html':
			return m.cooking.import.error.notHtml;
		case 'too-large':
			return m.cooking.import.error.tooLarge;
		case 'no-recipe':
			return m.cooking.import.error.noRecipe;
	}
}

/** One fetched recipe page, read every way the import may need it. */
export type RecipePage = {
	/** Where the redirects ended — what relative image links resolve against. */
	finalUrl: string;
	/** The page's own recipe card: JSON-LD, else Microdata — null when it has neither. */
	card: RecipeJsonLd | null;
	/** The page as readable lines, for a model to read when there is no card (→ plan 13). */
	text: string;
	/** A photo to offer: the card's own, else the page's `og:image` (unresolved). */
	image: string | null;
};

/**
 * Fetch a recipe page once and read it every way: its card, its text, its
 * photo. A blocked or unreachable page throws (`RecipeImportError`) — there is
 * nothing to hand anyone. A page with no card is not an error: that is the
 * import screen's "no recipe data here — try with AI?".
 */
export async function readRecipePage(url: string): Promise<RecipePage> {
	const { html, finalUrl } = await fetchRecipePage(url);
	const card = parseRecipeJsonLd(html) ?? parseRecipeMicrodata(html);
	const { text, ogImage } = readableParts(html);

	return { finalUrl, card, text, image: card?.image ?? ogImage };
}

/**
 * A card as the editor's draft, capped the way `writeChildren` caps at insert —
 * so a paste-bomb page never fills the editor with hundreds of rows (→ plan 07).
 * Its steps read their own text: a card knows nothing about which ingredient
 * goes where, or for how long.
 */
export function draftFromCard(card: RecipeJsonLd, photo: RecipePrefill['photo']): RecipePrefill {
	return {
		name: card.name.slice(0, RECIPE_NAME_MAX),
		timeMinutes: clampCount(card.timeMinutes, RECIPE_TIME_MAX),
		servings: clampCount(card.servings, RECIPE_SERVINGS_MAX),
		ingredientLines: card.ingredientLines
			.map((line) => line.slice(0, INGREDIENT_LINE_MAX))
			.slice(0, INGREDIENTS_MAX),
		steps: card.steps.map((step) => plainStep(step.slice(0, STEP_TEXT_MAX))).slice(0, STEPS_MAX),
		photo
	};
}

/** The page's photo, downloaded and re-encoded — or null, never an error (→ SPEC §4.7). */
export function importPagePhoto(page: RecipePage): Promise<RecipePrefill['photo']> {
	return page.image ? importPhoto(page.image, page.finalUrl) : Promise.resolve(null);
}

/** Elements whose content is never the recipe: code, chrome, and the page's furniture. */
const NOT_PROSE =
	'script, style, head, nav, header, footer, aside, noscript, svg, template, form, iframe, button, select';

/**
 * A page stripped to the readable text a model extracts from (→ plans 13, 22).
 * Kept as **lines** — headings, paragraphs and list items each on their own —
 * because "Zutaten" above a list reads as a structure, where one run-on
 * paragraph made the model guess where the ingredients ended. Chrome
 * (`nav`/`header`/`footer`/…) and comment sections go first; if the page marks
 * up its content as `<main>` or `<article>` and that holds a real amount of
 * text, only that is kept. Fewer tokens is kinder to a free tier.
 */
export function htmlToReadableText(html: string): string {
	return readableParts(html).text;
}

function readableParts(html: string): { text: string; ogImage: string | null } {
	let root: HTMLElement;
	try {
		root = parse(html, { comment: false });
	} catch {
		// A parser that chokes is no reason to fail the import; the old flattening
		// still gives a model something to read.
		return { text: flatten(html), ogImage: null };
	}

	const ogImage =
		root
			.querySelectorAll('meta')
			.find((meta) => /^og:image(?::url)?$/i.test(meta.getAttribute('property') ?? ''))
			?.getAttribute('content')
			?.trim() || null;

	for (const element of root.querySelectorAll(NOT_PROSE)) element.remove();
	for (const element of root.querySelectorAll('[id], [class]')) {
		const names = `${element.id} ${element.getAttribute('class') ?? ''}`.toLowerCase();
		if (/comment|kommentar/.test(names)) element.remove();
	}

	const content = [root.querySelector('main'), root.querySelector('article')].find(
		(candidate) => candidate && candidate.text.trim().length >= MIN_CONTENT_CHARS
	);

	const text = (content ?? root).structuredText
		.split('\n')
		.map((line) => decodeEntities(line).replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n')
		.slice(0, MAX_READABLE_CHARS);

	return { text, ogImage };
}

/** Below this a `<main>` is a wrapper around a hero image, not the page's content. */
const MIN_CONTENT_CHARS = 400;

/** The pre-parser fallback: tags to spaces, entities decoded, one long line. */
function flatten(html: string): string {
	const stripped = html
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(
			/<(script|style|head|nav|header|footer|aside|noscript|svg|template|form)\b[^>]*>[\s\S]*?<\/\1>/gi,
			' '
		)
		.replace(/<[^>]+>/g, ' ');

	return decodeEntities(stripped).replace(/\s+/g, ' ').trim().slice(0, MAX_READABLE_CHARS);
}

/** Fetch a recipe page as HTML, or throw the reason it couldn't. */
export async function fetchRecipePage(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
	const { response, finalUrl } = await fetchGuarded(rawUrl, {
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		timeoutMs: PAGE_TIMEOUT_MS
	});

	const contentType = response.headers.get('content-type') ?? '';
	if (!/\btext\/html\b|\bapplication\/xhtml\+xml\b/i.test(contentType)) {
		await discard(response);
		throw new RecipeImportError('not-html');
	}

	const bytes = await readCapped(response, MAX_PAGE_BYTES);
	return { html: decodeHtml(bytes, contentType), finalUrl };
}

/**
 * Decode a page to text honoring the `Content-Type` charset, defaulting to
 * UTF-8. A German recipe site served as ISO-8859-1 / Windows-1252 (still out
 * there, and exactly where umlauts live) would turn `ä ö ü ß` into replacement
 * characters if forced through UTF-8 — so the imported name and ingredients
 * would carry mojibake. An unknown charset label makes `TextDecoder` throw, and
 * we fall back to UTF-8 (which is what JSON-LD is supposed to be anyway).
 */
function decodeHtml(bytes: Buffer, contentType: string): string {
	const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
	try {
		return new TextDecoder(charset ?? 'utf-8').decode(bytes);
	} catch {
		return new TextDecoder('utf-8').decode(bytes);
	}
}

/**
 * Download the recipe's photo and push it through the upload pipeline. Every
 * failure — blocked host, too large, not decodable, network — is swallowed to
 * null: a recipe without its picture is a fine import, a failed import over a
 * picture is not (→ SPEC §4.7).
 */
async function importPhoto(candidate: string, baseUrl: string): Promise<RecipePrefill['photo']> {
	try {
		// Resolve against the page it was found on: recipe sites give protocol-
		// relative and root-relative image URLs freely.
		const imageUrl = new URL(candidate, baseUrl).href;
		const { response } = await fetchGuarded(imageUrl, {
			accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
			timeoutMs: IMAGE_TIMEOUT_MS
		});

		const bytes = await readCapped(response, MAX_IMAGE_BYTES);
		const { imagePath, webp } = await storePhotoFromBytes(bytes);

		// The preview is inlined rather than served: the temp file isn't attached to
		// any recipe yet, and the scoped image endpoint (rightly) refuses a file no
		// row owns. The bytes are this user's own download, in this user's own page.
		return { path: imagePath, preview: `data:image/webp;base64,${webp.toString('base64')}` };
	} catch {
		return null;
	}
}

/* ── Guarded fetch ────────────────────────────────────────────────────────── */

type FetchOptions = { accept: string; timeoutMs: number };

/**
 * Fetch `rawUrl`, following redirects **by hand** so every hop's URL is vetted
 * and every hop's hostname re-resolved before a connection is made — a 302 to
 * `http://169.254.169.254/` (the cloud metadata endpoint) is refused as firmly as
 * the original URL would be. Returns the final, non-redirect response plus the URL
 * it came from (for resolving relative image links).
 */
async function fetchGuarded(
	rawUrl: string,
	options: FetchOptions
): Promise<{ response: Response; finalUrl: string }> {
	let current: URL;
	try {
		current = new URL(rawUrl);
	} catch {
		throw new RecipeImportError('invalid-url');
	}

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		assertHttp(current);
		await assertPublicHost(current);

		let response: Response;
		try {
			response = await fetch(current, {
				method: 'GET',
				redirect: 'manual',
				signal: AbortSignal.timeout(options.timeoutMs),
				headers: {
					'User-Agent': BROWSER_UA,
					Accept: options.accept,
					'Accept-Language': 'en,de;q=0.8'
				}
			});
		} catch {
			// DNS-at-connect, a refused connection, or the timeout firing.
			throw new RecipeImportError('unreachable');
		}

		if (REDIRECT_STATUSES.has(response.status)) {
			const location = response.headers.get('location');
			await discard(response);
			if (!location) throw new RecipeImportError('unreachable');
			try {
				current = new URL(location, current);
			} catch {
				throw new RecipeImportError('blocked');
			}
			continue;
		}

		if (!response.ok) {
			await discard(response);
			throw new RecipeImportError('unreachable');
		}

		return { response, finalUrl: current.href };
	}

	// Fell out of the loop still redirecting — a redirect chain or a loop.
	throw new RecipeImportError('unreachable');
}

function assertHttp(url: URL): void {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new RecipeImportError('blocked');
	}
}

/**
 * Resolve a URL's hostname and refuse it if any address it answers with is one
 * the server shouldn't be pointed at (loopback, private, link-local, …). An IP
 * literal is checked directly, no lookup. Throws `blocked` before any request is
 * made — which is what makes `http://127.0.0.1/`, `http://192.168.1.1/` and
 * `localhost` refusals that never touch the target.
 */
async function assertPublicHost(url: URL): Promise<void> {
	// URL keeps IPv6 literals in brackets; DNS and the classifier want them bare.
	const host = url.hostname.replace(/^\[|\]$/g, '');

	let addresses: string[];
	if (isIPv4(host) || isIPv6(host)) {
		addresses = [host];
	} else {
		try {
			addresses = (await lookup(host, { all: true })).map((record) => record.address);
		} catch {
			throw new RecipeImportError('unreachable');
		}
	}

	if (addresses.length === 0) throw new RecipeImportError('unreachable');
	for (const address of addresses) {
		if (isBlockedAddress(address)) throw new RecipeImportError('blocked');
	}
}

/** Read a response body up to `maxBytes`, aborting the download the moment it's exceeded. */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
	const declared = Number(response.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) {
		await discard(response);
		throw new RecipeImportError('too-large');
	}

	if (!response.body) return Buffer.alloc(0);

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;

		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			throw new RecipeImportError('too-large');
		}
		chunks.push(value);
	}

	return Buffer.concat(chunks);
}

/** Drain-cancel a body we're done with, so the socket isn't left hanging. */
async function discard(response: Response): Promise<void> {
	try {
		await response.body?.cancel();
	} catch {
		// Already consumed or errored — nothing to release.
	}
}

/* ── Address classification ───────────────────────────────────────────────── */

/**
 * Whether an address is one the server must not be steered onto — the SSRF
 * blocklist. Covers loopback, RFC 1918 private, link-local, CGNAT and the
 * reserved/multicast ranges, for both families; an unrecognised string is
 * refused rather than trusted.
 */
function isBlockedAddress(ip: string): boolean {
	if (isIPv4(ip)) return isBlockedV4(ip);
	if (isIPv6(ip)) return isBlockedV6(ip.toLowerCase());
	return true;
}

function isBlockedV4(ip: string): boolean {
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
		return true;
	}

	const [a, b] = parts;
	if (a === 0) return true; // 0.0.0.0/8   "this host"
	if (a === 10) return true; // 10.0.0.0/8  private
	if (a === 127) return true; // 127.0.0.0/8 loopback
	if (a === 169 && b === 254) return true; // 169.254/16  link-local (incl. cloud metadata)
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12   private
	if (a === 192 && b === 168) return true; // 192.168/16  private
	if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0/24  IETF protocol
	if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10   CGNAT
	if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15   benchmarking
	if (a >= 224) return true; // 224/4 multicast, 240/4 reserved, 255.255.255.255

	return false;
}

function isBlockedV6(ip: string): boolean {
	// IPv4-mapped / embedded (`::ffff:1.2.3.4`, `64:ff9b::1.2.3.4`): the address
	// that actually gets routed is the trailing IPv4, so classify that.
	if (ip.includes('.')) {
		const embedded = ip.slice(ip.lastIndexOf(':') + 1);
		return isIPv4(embedded) ? isBlockedV4(embedded) : true;
	}

	const groups = expandV6(ip);
	if (!groups) return true;

	if (groups.every((g) => g === 0)) return true; // ::   unspecified
	if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1 loopback

	const first = groups[0];
	if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7  unique local
	if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
	if ((first & 0xff00) === 0xff00) return true; // ff00::/8  multicast

	return false;
}

/** A validated IPv6 string to its eight 16-bit groups, `::` expanded. */
function expandV6(ip: string): number[] | null {
	const withoutZone = ip.split('%')[0];
	const halves = withoutZone.split('::');
	if (halves.length > 2) return null;

	const toGroups = (part: string) => (part ? part.split(':').map((h) => parseInt(h, 16)) : []);
	const head = toGroups(halves[0]);
	const tail = halves.length === 2 ? toGroups(halves[1]) : [];
	if ([...head, ...tail].some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;

	if (halves.length === 2) {
		const fill = 8 - head.length - tail.length;
		if (fill < 0) return null;
		return [...head, ...Array(fill).fill(0), ...tail];
	}

	return head.length === 8 ? head : null;
}
