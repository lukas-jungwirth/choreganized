/**
 * A batch of new raccoon art → masters in `artwork/raccoon/` (→ DECISIONS #220).
 *
 *   npm run raccoons                       check, cut, save, contact sheet (design/new-raccoons)
 *   npm run raccoons -- <folder>           …from another folder
 *   npm run raccoons -- --replace          …overwriting masters of the same name
 *
 * Every `*.png` in the folder, named as it should be called (`kite.png` →
 * `kite`, kebab-case; files starting with `_` are skipped — the contact sheet
 * is one), is checked first:
 *
 *   - the background is transparent, and the art doesn't run off the top or a
 *     side of the canvas;
 *   - it is at least 408px tall once trimmed — 3× Home's 136px, the tallest a
 *     raccoon is shown at;
 *   - its bottom is flat, or can be made flat by cutting off at most a fifth
 *     (`scripts/raccoon-art.ts`, the measure the perch test holds the app to).
 *
 * Only when every file passes does it write anything: each one trimmed, cut
 * flat and saved as a 256-colour PNG, like the masters already there. Then a
 * contact sheet, `<folder>/_sheet.png`, shows the batch sitting on a card
 * strip, for a person (or the `/raccoons` command) to look at.
 *
 * It doesn't decide where a raccoon goes: that is `artwork/raccoon/mascots.json`,
 * then `npm run icons`. Standalone like the other scripts — Node runs it as
 * TypeScript.
 */
import sharp from 'sharp';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatCut, flatness, problems, rowSpans, type Raw } from './raccoon-art.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARTWORK = join(root, 'artwork/raccoon');

/** Where new art is dropped: kept in the repo, its contents ignored (→ .gitignore). */
const DROP_FOLDER = join(root, 'design/new-raccoons');

/** 3× Home's 136px: anything shorter is soft on a 3× phone. */
const MIN_HEIGHT = 408;

/** The masters' own format (→ artwork/raccoon/README.md). */
const MASTER_PNG = {
	palette: true,
	colours: 256,
	dither: 0,
	effort: 10,
	compressionLevel: 9
} as const;

type Checked = {
	name: string;
	file: string;
	/** Trimmed, before the cut. */
	trimmed: Buffer;
	width: number;
	height: number;
	cut: number;
	before: number;
	after: number;
};

async function raw(input: Buffer | string): Promise<Raw> {
	const { data, info } = await sharp(input)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}

async function check(
	file: string,
	replace: boolean
): Promise<{ ok: Checked } | { errors: string[] }> {
	const name = basename(file, '.png');
	const errors: string[] = [];

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
		errors.push(`"${name}" isn't a kebab-case name — rename the file, e.g. kite.png`);
	}
	if (existsSync(join(ARTWORK, `${name}.png`)) && !replace) {
		errors.push(`artwork/raccoon/${name}.png exists — pick another name, or pass --replace`);
	}

	const meta = await sharp(file).metadata();
	if (!meta.hasAlpha) return { errors: [...errors, 'it has no transparency at all'] };

	errors.push(...problems(await raw(file)));
	if (errors.length) return { errors };

	const trimmed = await sharp(file).trim().png().toBuffer();
	const pixels = await raw(trimmed);
	if (pixels.height < MIN_HEIGHT) {
		return { errors: [`only ${pixels.height}px tall once trimmed; it needs ${MIN_HEIGHT}`] };
	}

	const spans = rowSpans(pixels);
	const cut = flatCut(spans);
	if (cut === null) {
		return { errors: ['its bottom is too round to cut flat within a fifth — regenerate it'] };
	}

	return {
		ok: {
			name,
			file,
			trimmed,
			width: pixels.width,
			height: pixels.height,
			cut,
			before: flatness(spans),
			after: flatness(spans, pixels.height - cut)
		}
	};
}

/** Cut flat, trim again (the cut can leave empty columns), palette PNG. */
async function master(item: Checked): Promise<Buffer> {
	const cutFlat = await sharp(item.trimmed)
		.extract({ left: 0, top: 0, width: item.width, height: item.height - item.cut })
		.png()
		.toBuffer();
	// Two pipelines: sharp trims before it extracts when both are in one.
	return sharp(cutFlat).trim().png(MASTER_PNG).toBuffer();
}

/** The batch side by side, each sitting on a white card strip, names underneath. */
async function contactSheet(items: Array<{ name: string; png: Buffer }>, out: string) {
	const tile = { width: 260, height: 300 };
	const art = 230;
	const columns = Math.min(items.length, 5);
	const rows = Math.ceil(items.length / columns);
	const layers: sharp.OverlayOptions[] = [];

	for (const [index, item] of items.entries()) {
		const left = (index % columns) * tile.width;
		const top = Math.floor(index / columns) * tile.height;
		const image = await sharp(item.png)
			.resize({ width: tile.width - 20, height: art, fit: 'inside' })
			.toBuffer({ resolveWithObject: true });
		layers.push({
			input: image.data,
			left: left + Math.round((tile.width - image.info.width) / 2),
			// 2px into the card, the way the app perches them.
			top: top + art - image.info.height + 2
		});
		const label = `<svg width="${tile.width - 20}" height="${tile.height - art}">
			<rect width="100%" height="34" fill="#ffffff"/>
			<text x="50%" y="60" font-family="sans-serif" font-size="18" fill="#5a5048" text-anchor="middle">${item.name}</text>
		</svg>`;
		layers.push({ input: Buffer.from(label), left: left + 10, top: top + art });
	}

	await sharp({
		create: {
			width: columns * tile.width,
			height: rows * tile.height,
			channels: 4,
			background: '#efe7da'
		}
	})
		.composite(layers)
		.png()
		.toFile(out);
}

async function main() {
	const args = process.argv.slice(2);
	const replace = args.includes('--replace');
	const folder = args.find((arg) => !arg.startsWith('--')) ?? DROP_FOLDER;
	if (!folder || !existsSync(folder) || !statSync(folder).isDirectory()) {
		console.error(
			'Usage: npm run raccoons [-- <folder of PNGs, default design/new-raccoons>] [--replace]'
		);
		process.exit(2);
	}

	const files = readdirSync(folder)
		.filter((file) => file.toLowerCase().endsWith('.png') && !/^[_.]/.test(file))
		.sort()
		.map((file) => join(folder, file));
	if (files.length === 0) {
		console.error(`No PNGs in ${folder}.`);
		process.exit(2);
	}

	const checked: Checked[] = [];
	let failed = false;
	for (const file of files) {
		const result = await check(file, replace);
		if ('errors' in result) {
			failed = true;
			console.log(`✗ ${basename(file)}`);
			for (const error of result.errors) console.log(`    ${error}`);
		} else {
			checked.push(result.ok);
		}
	}
	if (failed) {
		console.log('\nNothing written: fix the files above and run it again.');
		process.exit(1);
	}

	const written: Array<{ name: string; png: Buffer }> = [];
	for (const item of checked) {
		const png = await master(item);
		writeFileSync(join(ARTWORK, `${item.name}.png`), png);
		written.push({ name: item.name, png });
		const { width, height } = await sharp(png).metadata();
		const cut = item.cut
			? `cut ${item.cut}px (${((100 * item.cut) / item.height).toFixed(1)}%), flatness ${item.before.toFixed(2)} → ${item.after.toFixed(2)}`
			: `already flat (${item.before.toFixed(2)})`;
		console.log(
			`✓ ${item.name}  ${width}×${height}, ${(png.length / 1024).toFixed(0)} KB — ${cut}`
		);
	}

	const sheet = join(folder, '_sheet.png');
	await contactSheet(written, sheet);
	console.log(`\nWrote ${written.length} master(s) to artwork/raccoon/ · contact sheet: ${sheet}`);
	console.log('Next: list them in artwork/raccoon/mascots.json, then npm run icons.');
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
