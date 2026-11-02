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
 *
 * Standalone by design (like scripts/seed.ts): no $lib/$env virtual modules, so
 * it runs under Node's native TypeScript support without Vite.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
 * The screen mascots — `artwork/raccoon/<name>.png` — and the height to store
 * each at: 3× the tallest it is shown (PageHeader's 88px, Home's 136px, the
 * login head's 90px, Settings' 120px and its exits' 104px), so it is sharp on
 * a 3× phone and no bigger.
 *
 * AVIF at quality 60: half the bytes of WebP with no difference you can see at
 * that size, and every browser the app supports reads it (Safari 16+). One
 * format, not a <picture> with a fallback, because the service worker precaches
 * every built asset — a second format would be downloaded too, never shown.
 */
const MASCOTS: Array<[name: string, height: number]> = [
	['shopping', 264],
	['cooking', 264],
	['tasks', 264],
	['expenses', 264],
	['head', 270],
	['welcome-a', 408],
	['welcome-b', 408],
	['reminder-upcoming', 408],
	['reminder-overdue', 408],
	// Home's day-dependent poses (→ `$lib/utils/raccoon`), the same 136px.
	['birthday', 408],
	['christmas', 408],
	['new-year', 408],
	['easter', 408],
	['halloween', 408],
	['valentines', 408],
	['sleeping', 408],
	// …and the everyday ones it rotates through, by month and time of day.
	['beach', 408],
	['summer-garden', 408],
	['garden', 408],
	['fishing', 408],
	['snow', 408],
	['cold', 408],
	['tea', 408],
	['reading', 408],
	['sports', 408],
	['settings', 360],
	['move-out', 312]
];

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
	for (const [name, height] of MASCOTS) {
		const { data, info } = await mascot(name, height);
		writeFileSync(join(MASCOT_DIR, `${name}.avif`), data);
		sizes.push(`${name}|${info.width}|${info.height}`);
		console.log(`  src/lib/assets/mascot/${name}.avif  (${(data.length / 1024).toFixed(1)} KB)`);
	}

	const entries = sizes.map((row) => row.split('|'));
	writeFileSync(
		join(MASCOT_DIR, 'index.ts'),
		[
			'// Generated by scripts/icons.ts from artwork/raccoon/ — do not edit by hand.',
			...entries.map(([name]) => `import ${camel(name)} from './${name}.avif';`),
			'',
			'/** Each raccoon and its pixel size, so `ui/Mascot` can reserve its box before it loads. */',
			'export const MASCOTS = {',
			...entries.map(([name, width, height], index) => {
				const key = name.includes('-') ? `'${name}'` : name;
				const comma = index < entries.length - 1 ? ',' : '';
				return `\t${key}: { src: ${camel(name)}, width: ${width}, height: ${height} }${comma}`;
			}),
			'} as const;',
			'',
			'export type MascotName = keyof typeof MASCOTS;',
			''
		].join('\n')
	);
	console.log('  src/lib/assets/mascot/index.ts');

	console.log(`\nGenerated ${icons.length + MASCOTS.length + 1} file(s) from artwork/raccoon/`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
