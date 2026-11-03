/**
 * PWA icons + mascot art — generated from the raccoon masters (→ DECISIONS #211, #215).
 *
 *   npm run icons
 *
 * Everything the app wears in a launcher, a browser tab or a lock screen, and
 * every raccoon a screen shows, is produced here from the PNG masters in
 * `artwork/raccoon/` — the only artwork the app uses, never shipped itself.
 * Re-run this after a master changes and commit the outputs.
 *
 * Outputs (committed):
 *   static/icons/icon-192.png · icon-512.png             app icon, full-bleed green (purpose: any)
 *   static/icons/icon-192-maskable.png · -512-maskable   head pulled into the safe circle (purpose: maskable)
 *   static/icons/apple-touch-icon.png (180)              iOS home screen, no alpha
 *   static/icons/favicon-32.png · favicon-96.png         browser tab
 *   static/icons/badge-72.png                            Android status-bar silhouette (alpha-only)
 *   src/lib/assets/mascot/*.avif                         the raccoon art the screens show
 *   src/lib/assets/mascot/index.ts                       their pixel sizes, for `ui/Mascot`
 *   src/lib/assets/mascot/everyday.ts                    Home's everyday poses + which are perched
 *   src/lib/assets/mascot/album.ts                       the raccoon album: numbers + stats (plan 35)
 *
 * Standalone by design (like scripts/seed.ts): no $lib/$env virtual modules, so
 * it runs under Node's native TypeScript support without Vite.
 */
import sharp from 'sharp';
import { bodyCentre } from './raccoon-art.ts';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARTWORK = join(root, 'artwork/raccoon');
const APP_ICON = join(ARTWORK, 'app-icon.png');
const FOREGROUND = join(ARTWORK, 'app-icon-foreground.png');
const ICONS_DIR = join(root, 'static/icons');
const MASCOT_DIR = join(root, 'src/lib/assets/mascot');

/**
 * The icon's own background — it belongs to the artwork, not the design-token
 * palette (a token is a var(); a rasterised PNG can hold no such thing). The
 * artwork fixes it at exactly #74A585 (→ artwork/raccoon/README.md).
 */
const GREEN = { r: 0x74, g: 0xa5, b: 0x85, alpha: 1 };

/**
 * A 256-colour palette PNG: the icons are flat green plus soft watercolour, and
 * at launcher size nobody can tell, but it is a third of the bytes — and the
 * service worker precaches every one of them on install.
 */
const ICON_PNG = { palette: true, quality: 90, effort: 10, compressionLevel: 9 } as const;

/** The square, opaque store icon at a launcher size. */
function appIcon(size: number): Promise<Buffer> {
	return sharp(APP_ICON).resize(size, size).flatten({ background: GREEN }).png(ICON_PNG).toBuffer();
}

/**
 * The transparent head centred on green at `ratio` of its own canvas, flattened
 * opaque. At 1 the head spans ~75% of the width, so its ears poke out of the
 * 80%-diameter circle a launcher may crop a maskable icon to; 0.8 brings every
 * corner inside it. Above 1 it fills a small tab icon more boldly.
 */
async function head(size: number, ratio: number): Promise<Buffer> {
	const px = Math.round(size * ratio);
	let art = sharp(FOREGROUND).resize(px, px);
	if (px > size) {
		const offset = Math.round((px - size) / 2);
		art = sharp(await art.toBuffer()).extract({
			left: offset,
			top: offset,
			width: size,
			height: size
		});
	}
	return sharp({ create: { width: size, height: size, channels: 4, background: GREEN } })
		.composite([{ input: await art.png().toBuffer(), gravity: 'center' }])
		.flatten({ background: GREEN })
		.png(ICON_PNG)
		.toBuffer();
}

/**
 * The Android notification badge: the head's outline in white on transparent.
 * Android keeps only the alpha channel and tints the silhouette itself, so the
 * face is noise at 24dp and the colour is irrelevant.
 */
async function badge(size: number): Promise<Buffer> {
	const alpha = await sharp(FOREGROUND)
		.trim()
		.resize(Math.round(size * 0.86), Math.round(size * 0.86), { fit: 'inside' })
		.extractChannel('alpha')
		.toBuffer();
	const { width, height } = await sharp(alpha).metadata();
	const white = await sharp({
		create: { width: width!, height: height!, channels: 3, background: '#ffffff' }
	})
		.joinChannel(alpha)
		.png()
		.toBuffer();
	return sharp({
		create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
	})
		.composite([{ input: white, gravity: 'center' }])
		.png({ compressionLevel: 9 })
		.toBuffer();
}

/**
 * The screen mascots — `artwork/raccoon/<name>.png` — listed in
 * `artwork/raccoon/mascots.json` (→ DECISIONS #220), each with the height to
 * store it at: 3× the tallest it is shown (PageHeader's 88px, Home's 136px,
 * the login head's 90px, Settings' 120px and its exits' 104px), so it is sharp
 * on a 3× phone and no bigger. `perched` marks the ones that sit on a card's
 * top edge (cut flat at the waist, → `tests/conventions/mascot-perch.test.ts`);
 * `seasons` makes one an everyday pose on Home, in the list's order, and
 * `lookAlike` names the poses that must never follow each other. `album` is a
 * Home raccoon's number in the raccoon album and `stats` its four fun scales,
 * 1–5 (→ plan 35); a number, once shipped, never moves.
 *
 * AVIF at quality 60: half the bytes of WebP with no difference you can see at
 * that size, and every browser the app supports reads it (Safari 16+). One
 * format, not a <picture> with a fallback, because the service worker precaches
 * every built asset — a second format would be downloaded too, never shown.
 */
type Entry = {
	name: string;
	height: number;
	perched?: boolean;
	seasons?: string[];
	lookAlike?: string;
	/** Where the body is across the width, 0–1, when the buttons can't be found (→ `bodyCentre`). */
	body?: number;
	album?: number;
	stats?: Record<string, number>;
};

const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const STATS = ['cosiness', 'mischief', 'snacks', 'helpfulness'];

function readMascots(): Entry[] {
	const { mascots } = JSON.parse(readFileSync(join(ARTWORK, 'mascots.json'), 'utf8')) as {
		mascots: Entry[];
	};
	const seen = new Set<string>();
	for (const entry of mascots) {
		const where = `mascots.json: ${entry.name}`;
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.name))
			throw new Error(`${where}: name must be kebab-case`);
		if (seen.has(entry.name)) throw new Error(`${where}: listed twice`);
		seen.add(entry.name);
		if (!existsSync(join(ARTWORK, `${entry.name}.png`)))
			throw new Error(`${where}: no ${entry.name}.png`);
		if (!Number.isInteger(entry.height) || entry.height <= 0) throw new Error(`${where}: height`);
		if (entry.seasons) {
			if (!entry.perched)
				throw new Error(`${where}: an everyday pose sits on Home's card, so it is perched`);
			if (entry.seasons.length === 0 || entry.seasons.some((season) => !SEASONS.includes(season)))
				throw new Error(`${where}: seasons are ${SEASONS.join(', ')}`);
		}
		if (entry.lookAlike && !entry.seasons)
			throw new Error(`${where}: lookAlike only means something for an everyday pose`);
		if (entry.album !== undefined) {
			if (!Number.isInteger(entry.album) || entry.album <= 0)
				throw new Error(`${where}: album is a whole number from 1`);
			const stats = entry.stats ?? {};
			const keys = Object.keys(stats);
			if (keys.length !== STATS.length || STATS.some((stat) => !keys.includes(stat)))
				throw new Error(`${where}: stats are ${STATS.join(', ')}`);
			if (Object.values(stats).some((value) => !Number.isInteger(value) || value < 1 || value > 5))
				throw new Error(`${where}: each stat is 1–5`);
		} else if (entry.stats) {
			throw new Error(`${where}: stats only mean something for an album raccoon`);
		}
	}
	const numbers = mascots.flatMap((entry) => entry.album ?? []).sort((a, b) => a - b);
	if (numbers.some((number, index) => number !== index + 1))
		throw new Error(`mascots.json: album numbers run 1 to ${numbers.length}, once each`);
	return mascots;
}

const MASCOTS = readMascots();

async function mascot(name: string, height: number) {
	return sharp(join(ARTWORK, `${name}.png`))
		.trim()
		.resize({ height })
		.avif({ quality: 60, effort: 7 })
		.toBuffer({ resolveWithObject: true });
}

/** `welcome-a` → `welcomeA`, for the generated imports. */
const camel = (name: string) => name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

async function main() {
	mkdirSync(ICONS_DIR, { recursive: true });
	mkdirSync(MASCOT_DIR, { recursive: true });

	const icons: Array<[string, Buffer]> = [
		['icon-192.png', await appIcon(192)],
		['icon-512.png', await appIcon(512)],
		['icon-192-maskable.png', await head(192, 0.8)],
		['icon-512-maskable.png', await head(512, 0.8)],
		// iOS applies its own rounding; the store icon is already square and opaque.
		['apple-touch-icon.png', await appIcon(180)],
		// A fuller crop reads better at tab size.
		['favicon-32.png', await head(32, 1.2)],
		['favicon-96.png', await head(96, 1.2)],
		['badge-72.png', await badge(72)]
	];
	for (const [name, buffer] of icons) {
		writeFileSync(join(ICONS_DIR, name), buffer);
		console.log(`  static/icons/${name}  (${(buffer.length / 1024).toFixed(1)} KB)`);
	}

	// Whatever an earlier run left that isn't in the list any more goes, so the
	// build never carries (and the service worker never precaches) a stray.
	for (const file of readdirSync(MASCOT_DIR)) rmSync(join(MASCOT_DIR, file));

	const sizes: string[] = [];
	for (const { name, height, perched, body: given } of MASCOTS) {
		const { data, info } = await mascot(name, height);
		writeFileSync(join(MASCOT_DIR, `${name}.avif`), data);
		// A perched raccoon is placed by its body (→ DECISIONS #224): found from
		// the master's buttons, or given by hand when they're hidden.
		let body = 0.5;
		if (perched) {
			const master = await sharp(join(ARTWORK, `${name}.png`))
				.trim()
				.ensureAlpha()
				.raw()
				.toBuffer({ resolveWithObject: true });
			const found =
				given ??
				bodyCentre({ data: master.data, width: master.info.width, height: master.info.height });
			if (found === null) {
				throw new Error(
					`${name}: can't see both overall buttons to find its body — set "body" (0–1 across the width) in mascots.json`
				);
			}
			body = found;
		}
		sizes.push(`${name}|${info.width}|${info.height}|${body}`);
		console.log(`  src/lib/assets/mascot/${name}.avif  (${(data.length / 1024).toFixed(1)} KB)`);
	}

	const entries = sizes.map((row) => row.split('|'));
	writeFileSync(
		join(MASCOT_DIR, 'index.ts'),
		[
			'// Generated by scripts/icons.ts from artwork/raccoon/ — do not edit by hand.',
			...entries.map(([name]) => `import ${camel(name)} from './${name}.avif';`),
			'',
			'/**',
			' * Each raccoon, its pixel size (so `ui/Mascot` can reserve its box before it',
			' * loads) and where its body is across that width, 0–1 (→ DECISIONS #224).',
			' */',
			'export const MASCOTS = {',
			...entries.map(([name, width, height, body], index) => {
				const key = name.includes('-') ? `'${name}'` : name;
				const comma = index < entries.length - 1 ? ',' : '';
				return `\t${key}: { src: ${camel(name)}, width: ${width}, height: ${height}, body: ${body} }${comma}`;
			}),
			'} as const;',
			'',
			'export type MascotName = keyof typeof MASCOTS;',
			''
		].join('\n')
	);
	console.log('  src/lib/assets/mascot/index.ts');

	// The rest of the list, without the images, for code that only needs names:
	// Home's picker and the tests import this without pulling in every AVIF.
	const quote = (value: string) => `'${value}'`;
	const everyday = MASCOTS.filter((entry) => entry.seasons);
	writeFileSync(
		join(MASCOT_DIR, 'everyday.ts'),
		[
			'// Generated by scripts/icons.ts from artwork/raccoon/mascots.json — do not edit by hand.',
			"import type { MascotName } from './index';",
			'',
			`export type Season = ${SEASONS.map(quote).join(' | ')};`,
			'',
			"/** Home's everyday poses, in the order it takes them (→ `utils/raccoon`). */",
			'export const EVERYDAY: ReadonlyArray<{',
			'\tname: MascotName;',
			'\tseasons: readonly Season[];',
			'\tlookAlike: string | null;',
			'}> = [',
			...everyday.map((entry, index) => {
				const comma = index < everyday.length - 1 ? ',' : '';
				const seasons = entry.seasons!.map(quote).join(', ');
				const lookAlike = entry.lookAlike ? quote(entry.lookAlike) : 'null';
				return `\t{ name: ${quote(entry.name)}, seasons: [${seasons}], lookAlike: ${lookAlike} }${comma}`;
			}),
			'];',
			'',
			"/** The raccoons that sit on a card's top edge, so must be cut flat at the waist. */",
			'export const PERCHED: readonly MascotName[] = [',
			...MASCOTS.filter((entry) => entry.perched).map(
				(entry, index, all) => `\t${quote(entry.name)}${index < all.length - 1 ? ',' : ''}`
			),
			'];',
			''
		].join('\n')
	);
	console.log('  src/lib/assets/mascot/everyday.ts');

	const album = MASCOTS.filter((entry) => entry.album).sort((a, b) => a.album! - b.album!);
	writeFileSync(
		join(MASCOT_DIR, 'album.ts'),
		[
			'// Generated by scripts/icons.ts from artwork/raccoon/mascots.json — do not edit by hand.',
			"import type { MascotName } from './index';",
			'',
			'/** The four fun scales on a raccoon card, 1–5 each (→ plan 35). */',
			`export const STATS = [${STATS.map(quote).join(', ')}] as const;`,
			'',
			'export type Stat = (typeof STATS)[number];',
			'',
			'/** A raccoon you can collect: one of the ones Home shows (→ `utils/raccoon`). */',
			'export type AlbumName =',
			...album.map(
				(entry, index) => `\t| ${quote(entry.name)}${index < album.length - 1 ? '' : ';'}`
			),
			'',
			'/** The raccoon album, by number (→ `utils/raccoon-album`). */',
			'export const ALBUM = [',
			...album.map((entry, index) => {
				const comma = index < album.length - 1 ? ',' : '';
				const stats = `{ ${STATS.map((stat) => `${stat}: ${entry.stats![stat]}`).join(', ')} }`;
				const line = `\t{ name: ${quote(entry.name)}, number: ${entry.album}, stats: ${stats} }${comma}`;
				// Prettier's own break, so the file comes out formatted: a tab counts as two.
				if (line.length + 1 <= 100) return line;
				return [
					'\t{',
					`\t\tname: ${quote(entry.name)},`,
					`\t\tnumber: ${entry.album},`,
					`\t\tstats: ${stats}`,
					`\t}${comma}`
				].join('\n');
			}),
			'] as const satisfies ReadonlyArray<{',
			'\tname: AlbumName & MascotName;',
			'\tnumber: number;',
			'\tstats: Readonly<Record<Stat, number>>;',
			'}>;',
			''
		].join('\n')
	);
	console.log('  src/lib/assets/mascot/album.ts');

	console.log(`\nGenerated ${icons.length + MASCOTS.length + 3} file(s) from artwork/raccoon/`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
