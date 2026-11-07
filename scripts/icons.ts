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
 *   static/icons/icon-192-maskable.png · -512-maskable   bust pulled into the safe circle (purpose: maskable)
 *   static/icons/apple-touch-icon.png (180)              iOS home screen, no alpha
 *   static/icons/favicon-32.png · favicon-96.png         browser tab
 *   static/icons/badge-72.png                            Android status-bar silhouette (alpha-only)
 *   static/icons/test/*.png                              the same minus the badge, labelled TEST (APP_STAGE=test)
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
import { format, resolveConfig } from 'prettier';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARTWORK = join(root, 'artwork/raccoon');
const APP_ICON = join(ARTWORK, 'app-icon.png');
const FOREGROUND = join(ARTWORK, 'app-icon-foreground.png');
const ICONS_DIR = join(root, 'static/icons');
/** The test deploy's labelled set, same names (→ `lib/server/stage.ts`). */
const TEST_ICONS_DIR = join(ICONS_DIR, 'test');
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

/**
 * The raccoon is a bust: head and shoulders, ending in a flat cut below the
 * overalls' bib. That cut must sit on the icon's bottom edge, or the body ends
 * in mid-air, so every icon is laid out from the artwork itself (trimmed to it)
 * rather than from the master's canvas (→ DECISIONS #235).
 *
 * `HEAD` is how much of the bust, from the top of the ears, is head: the chin
 * and collar sit just above 72%. The tab icon and the badge show only that part,
 * as a whole bust is a smudge at 32px.
 */
const HEAD = 0.72;

/** The opaque master's artwork, cut free of its green. */
async function appIconArt(): Promise<Buffer> {
	return sharp(APP_ICON).trim({ background: GREEN, threshold: 20 }).png().toBuffer();
}

/** The transparent master's artwork, trimmed; `head` keeps only the top `HEAD` of it. */
async function foregroundArt(head = false): Promise<Buffer> {
	const bust = await sharp(FOREGROUND).trim().png().toBuffer();
	if (!head) return bust;
	const { width, height } = await sharp(bust).metadata();
	return sharp(bust)
		.extract({ left: 0, top: 0, width: width!, height: Math.round(height! * HEAD) })
		.trim()
		.png()
		.toBuffer();
}

/**
 * `art` on a square of green, `fill` of the side tall (or wide, if that is the
 * tighter fit), centred across and standing on the bottom edge.
 */
async function standing(art: Buffer, size: number, fill: number): Promise<Buffer> {
	const box = Math.round(size * fill);
	const fitted = await sharp(art)
		.resize(box, box, { fit: 'inside' })
		.png()
		.toBuffer({ resolveWithObject: true });
	return sharp({ create: { width: size, height: size, channels: 4, background: GREEN } })
		.composite([
			{
				input: fitted.data,
				left: Math.round((size - fitted.info.width) / 2),
				top: size - fitted.info.height
			}
		])
		.flatten({ background: GREEN })
		.png(ICON_PNG)
		.toBuffer();
}

/**
 * The store icon (purpose: any, and iOS's): the bust at 86%, standing on the
 * edge. iOS and Android round the corners themselves; the square stays opaque.
 */
async function appIcon(size: number): Promise<Buffer> {
	return standing(await appIconArt(), size, 0.86);
}

/**
 * The maskable icon: a launcher may crop it to the 80%-diameter circle, so the
 * bust stands on the edge at 80%, with the head inside that circle and some room
 * to spare: 84% fits too, but looked too big (→ DECISIONS #248, #249). The bottom
 * of the body running into the mask is how a portrait in a circle looks anyway
 * (`tests/conventions/app-icons.test.ts` checks the ears and the headroom).
 */
async function maskable(size: number): Promise<Buffer> {
	return standing(await foregroundArt(), size, 0.8);
}

/** The tab icon: the head alone, filling the square, cut at the neck on the bottom edge. */
async function favicon(size: number): Promise<Buffer> {
	return standing(await foregroundArt(true), size, 0.96);
}

/**
 * The Android notification badge: the head's outline in white on transparent.
 * Android keeps only the alpha channel and tints the silhouette itself, so the
 * face is noise at 24dp and the colour is irrelevant. The head alone: the ears
 * are what make the shape a raccoon, and the cape would only blur it.
 */
async function badge(size: number): Promise<Buffer> {
	const alpha = await sharp(await foregroundArt(true))
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
 * The test deploy's mark (→ DECISIONS #236): a yellow label reading TEST over
 * the same icon, so the test app and the household's app can't be mixed up on
 * one phone. The letters are drawn as blocks, not set in a font, so the output
 * doesn't depend on the fonts of whoever runs this.
 */
const LABEL = { fill: '#F2B200', ink: '#2B1F1A' };

/** TEST on a 3×5 grid per letter, one blank column between letters. */
const TEST_GLYPHS = [
	['###', '.#.', '.#.', '.#.', '.#.'],
	['###', '#..', '###', '#..', '###'],
	['###', '#..', '###', '..#', '###'],
	['###', '.#.', '.#.', '.#.', '.#.']
];
const TEST_COLUMNS = TEST_GLYPHS.length * 4 - 1;

/** The lettering as SVG rects, `unit` px per grid cell, top-left at (x, y). */
function testLetters(x: number, y: number, unit: number): string {
	const rects: string[] = [];
	TEST_GLYPHS.forEach((glyph, letter) => {
		glyph.forEach((row, line) => {
			[...row].forEach((cell, column) => {
				if (cell !== '#') return;
				const left = x + (letter * 4 + column) * unit;
				rects.push(`<rect x="${left}" y="${y + line * unit}" width="${unit}" height="${unit}"/>`);
			});
		});
	});
	return `<g fill="${LABEL.ink}" shape-rendering="crispEdges">${rects.join('')}</g>`;
}

/** The lettering's size: `unit` px per grid cell. */
const testSize = (unit: number) => ({ width: TEST_COLUMNS * unit, height: 5 * unit });

/**
 * A launcher icon with the TEST pill on it: `centre` is the pill's vertical
 * centre and `height` the lettering's, both as shares of the side. Narrow
 * enough to stay clear of any launcher's mask (on the maskable icon, inside the
 * 80% safe circle), and below the face.
 */
async function testPill(icon: Buffer, size: number, centre: number, height: number) {
	const unit = Math.max(1, Math.round((size * height) / 5));
	const text = testSize(unit);
	const width = text.width + 6 * unit;
	const pill = text.height + 4 * unit;
	const left = Math.round((size - width) / 2);
	const top = Math.round(size * centre - pill / 2);
	const svg = `<rect x="${left}" y="${top}" width="${width}" height="${pill}" rx="${pill / 2}" fill="${LABEL.fill}"/>${testLetters(left + 3 * unit, top + 2 * unit, unit)}`;
	return sharp(icon)
		.composite([
			{
				input: Buffer.from(
					`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${svg}</svg>`
				)
			}
		])
		.png(ICON_PNG)
		.toBuffer();
}

/**
 * The test tab icon: a full-width TEST band along the bottom, and the head
 * standing on it, smaller, rather than under it, since the face is at the
 * bottom of the head. `unit` is the letters' cell, 2px at the least to stay letters.
 */
async function testFavicon(size: number, unit: number) {
	const text = testSize(unit);
	const band = text.height + 2 * unit;
	const side = size - band;
	const head = await standing(await foregroundArt(true), side, 0.96);
	const svg = `<rect x="0" y="${side}" width="${size}" height="${band}" fill="${LABEL.fill}"/>${testLetters(Math.round((size - text.width) / 2), side + unit, unit)}`;
	return sharp({ create: { width: size, height: size, channels: 4, background: GREEN } })
		.composite([
			{ input: head, left: Math.round((size - side) / 2), top: 0 },
			{
				input: Buffer.from(
					`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${svg}</svg>`
				)
			}
		])
		.flatten({ background: GREEN })
		.png(ICON_PNG)
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
 * `lookAlike` names the poses that must never follow each other. `days`
 * (`mon`–`sun`) and `slots` (`morning`, `afternoon`, `evening`) narrow an
 * everyday pose to some days or some of Home's slots (→ DECISIONS #237); `weight`
 * multiplies its odds in the draw where it is allowed (→ DECISIONS #243). `album` is a
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
	days?: string[];
	slots?: string[];
	weight?: number;
	/** Where the body is across the width, 0–1, when the buttons can't be found (→ `bodyCentre`). */
	body?: number;
	album?: number;
	stats?: Record<string, number>;
};

const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SLOTS = ['morning', 'afternoon', 'evening'];
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
		for (const [field, allowed] of [
			['days', WEEKDAYS],
			['slots', SLOTS]
		] as const) {
			const given = entry[field];
			if (!given) continue;
			if (!entry.seasons)
				throw new Error(`${where}: ${field} only mean something for an everyday pose`);
			if (
				given.length === 0 ||
				given.length === allowed.length ||
				new Set(given).size !== given.length ||
				given.some((each) => !allowed.includes(each))
			)
				throw new Error(
					`${where}: ${field} are some of ${allowed.join(', ')}, once each (leave it out for all)`
				);
		}
		if (entry.weight !== undefined) {
			if (!entry.seasons)
				throw new Error(`${where}: weight only means something for an everyday pose`);
			if (!Number.isInteger(entry.weight) || entry.weight < 2)
				throw new Error(`${where}: weight is a whole number from 2 (leave it out for 1)`);
		}
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

/** A generated file in the repo's own style, so `npm run lint` passes on what this writes. */
async function prettier(file: string, text: string): Promise<string> {
	return format(text, { ...(await resolveConfig(file)), filepath: file });
}

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
		['icon-192-maskable.png', await maskable(192)],
		['icon-512-maskable.png', await maskable(512)],
		// iOS applies its own rounding; the store icon is already square and opaque.
		['apple-touch-icon.png', await appIcon(180)],
		['favicon-32.png', await favicon(32)],
		['favicon-96.png', await favicon(96)],
		['badge-72.png', await badge(72)]
	];
	for (const [name, buffer] of icons) {
		writeFileSync(join(ICONS_DIR, name), buffer);
		console.log(`  static/icons/${name}  (${(buffer.length / 1024).toFixed(1)} KB)`);
	}

	// The test deploy's set: the same icons, labelled (→ DECISIONS #236). The
	// badge has none: Android draws it as a 24dp silhouette, where no label reads.
	const byName = new Map(icons);
	const pill = (name: string, size: number, centre: number, height: number) =>
		testPill(byName.get(name)!, size, centre, height);
	const testIcons: Array<[string, Buffer]> = [
		['icon-192.png', await pill('icon-192.png', 192, 0.8, 0.1)],
		['icon-512.png', await pill('icon-512.png', 512, 0.8, 0.1)],
		['icon-192-maskable.png', await pill('icon-192-maskable.png', 192, 0.81, 0.07)],
		['icon-512-maskable.png', await pill('icon-512-maskable.png', 512, 0.81, 0.07)],
		['apple-touch-icon.png', await pill('apple-touch-icon.png', 180, 0.8, 0.1)],
		['favicon-32.png', await testFavicon(32, 2)],
		['favicon-96.png', await testFavicon(96, 4)]
	];
	mkdirSync(TEST_ICONS_DIR, { recursive: true });
	for (const file of readdirSync(TEST_ICONS_DIR)) rmSync(join(TEST_ICONS_DIR, file));
	for (const [name, buffer] of testIcons) {
		writeFileSync(join(TEST_ICONS_DIR, name), buffer);
		console.log(`  static/icons/test/${name}  (${(buffer.length / 1024).toFixed(1)} KB)`);
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
	const everydayFile = join(MASCOT_DIR, 'everyday.ts');
	writeFileSync(
		everydayFile,
		await prettier(
			everydayFile,
			[
				'// Generated by scripts/icons.ts from artwork/raccoon/mascots.json — do not edit by hand.',
				"import type { MascotName } from './index';",
				'',
				`export type Season = ${SEASONS.map(quote).join(' | ')};`,
				`export type Weekday = ${WEEKDAYS.map(quote).join(' | ')};`,
				`export type DaySlot = ${SLOTS.map(quote).join(' | ')};`,
				'',
				"/** Home's everyday poses, in the order it takes them (→ `utils/raccoon`). */",
				'export const EVERYDAY: ReadonlyArray<{',
				'\tname: MascotName;',
				'\tseasons: readonly Season[];',
				'\tlookAlike: string | null;',
				"\t/** Only on these days, in the week's order; every day when left out. */",
				'\tdays?: readonly Weekday[];',
				"\t/** Only in these of Home's slots; all three when left out. */",
				'\tslots?: readonly DaySlot[];',
				'\t/** Its odds in the draw where it is allowed, against 1 for the others. */',
				'\tweight?: number;',
				'}> = [',
				...everyday.map((entry, index) => {
					const comma = index < everyday.length - 1 ? ',' : '';
					const seasons = entry.seasons!.map(quote).join(', ');
					const lookAlike = entry.lookAlike ? quote(entry.lookAlike) : 'null';
					const inOrder = (field: string, given: string[] | undefined, order: string[]) =>
						given
							? `, ${field}: [${order
									.filter((each) => given.includes(each))
									.map(quote)
									.join(', ')}]`
							: '';
					const days = inOrder('days', entry.days, WEEKDAYS);
					const slots = inOrder('slots', entry.slots, SLOTS);
					const weight = entry.weight ? `, weight: ${entry.weight}` : '';
					return `\t{ name: ${quote(entry.name)}, seasons: [${seasons}], lookAlike: ${lookAlike}${days}${slots}${weight} }${comma}`;
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
		)
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
