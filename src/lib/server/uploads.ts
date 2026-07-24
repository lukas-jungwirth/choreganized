/**
 * Recipe photos on disk (→ SPEC §4.4, docs/ARCHITECTURE.md "Deployment").
 *
 * Three rules hold this together:
 *
 * 1. **Nothing is stored as uploaded.** Every image goes through sharp and comes
 *    out a ≤1200px WebP — a 12 MP phone photo is ~4 MB of JPEG and ~90 KB of
 *    WebP at the size a 390px screen actually shows, and re-encoding also
 *    strips EXIF (including where the picture was taken) as a side effect.
 * 2. **The filename carries a random token**, so replacing a photo changes its
 *    URL. Same-path replacement would leave every phone that ever loaded the
 *    old one showing it, and would make caching a choice between stale images
 *    and no caching at all.
 * 3. **`imagePath` is the only key.** Files are never listed or globbed; the
 *    serving endpoint looks the path up in `recipes` scoped by household, so a
 *    path this app didn't write is a path nobody can read (→ SPEC §8).
 *
 * The database calls are synchronous (better-sqlite3), so the filesystem helpers
 * that services call are too — they move a handful of kilobytes on local disk.
 * Only the sharp pipeline, which is genuinely worth awaiting, is async.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { env } from '$env/dynamic/private';
import sharp from 'sharp';
import type { Messages } from '$lib/i18n';

/** The longest edge a stored photo keeps — the design's hero is 290px tall. */
const IMAGE_MAX_PX = 1200;

/**
 * Bigger than any phone photo; past this we don't even decode it. The server in
 * front has to allow at least this much too — adapter-node's `BODY_SIZE_LIMIT`
 * defaults to 512K and answers 413 long before this check
 * (→ docs/ARCHITECTURE.md "Deployment").
 */
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

/** Everything under here is a recipe photo; the subfolder keeps room for more. */
const RECIPES_DIR = 'recipes';

/** Why an upload was refused. The words live in `$lib/i18n` (`errors.photo`). */
export type UploadErrorCode =
	'too-large' | 'not-an-image' | 'unreadable' | 'store-failed' | 'disk-failed';

/**
 * A rejected upload. It carries a *code*, not a sentence: the person who picked
 * the file reads it, and this module has no idea which language they read in.
 */
export class UploadError extends Error {
	constructor(readonly code: UploadErrorCode) {
		super(code);
		this.name = 'UploadError';
	}
}

/** What an action sends back with its 400 — ours by code, anything else generic. */
export function uploadErrorMessage(cause: unknown, m: Messages): string {
	if (!(cause instanceof UploadError)) return m.errors.photo.notSaved;

	switch (cause.code) {
		case 'too-large':
			return m.errors.photo.tooLarge(Math.round(UPLOAD_MAX_BYTES / 1024 / 1024));
		case 'not-an-image':
			return m.errors.photo.notAnImage;
		case 'unreadable':
			return m.errors.photo.unreadable;
		case 'store-failed':
			return m.errors.photo.storeFailed;
		case 'disk-failed':
			return m.errors.photo.diskFailed;
	}
}

/** Resolved per call: `$env/dynamic/private` is empty while the app is building. */
function uploadsRoot(): string {
	return resolve(env.UPLOADS_DIR ?? './data/uploads');
}

/**
 * The absolute path of a stored file, or `null` if the relative path tries to
 * leave the uploads directory. Belt and braces next to the database lookup: no
 * caller should ever hand this an unvetted string, and if one does, `..` and
 * absolute paths still find nothing.
 */
function resolveUpload(relativePath: string): string | null {
	if (!relativePath || isAbsolute(relativePath) || relativePath.includes('\0')) return null;

	const root = uploadsRoot();
	const target = resolve(root, normalize(relativePath));

	return target.startsWith(root + sep) ? target : null;
}

/**
 * Validate and re-encode an uploaded photo, without touching the disk. Split
 * from storing it so an action can reject a bad file **before** it writes
 * anything else: everything that can go wrong with the picture goes wrong here,
 * where the answer is still "try another photo" rather than a half-saved recipe.
 */
async function processImage(file: File): Promise<Buffer> {
	if (file.size > UPLOAD_MAX_BYTES) {
		throw new UploadError('too-large');
	}
	if (file.type && !file.type.startsWith('image/')) {
		throw new UploadError('not-an-image');
	}

	try {
		return await sharp(Buffer.from(await file.arrayBuffer()))
			// Phone cameras store the orientation in EXIF rather than in the
			// pixels; without this a portrait photo arrives on its side.
			.rotate()
			.resize({
				width: IMAGE_MAX_PX,
				height: IMAGE_MAX_PX,
				fit: 'inside',
				withoutEnlargement: true
			})
			.webp({ quality: 80 })
			.toBuffer();
	} catch {
		throw new UploadError('unreadable');
	}
}

/** Write processed bytes and hand back the path to store in `imagePath`. */
function storeImage(data: Buffer): string {
	return writeUpload(newImagePath(), data);
}

/**
 * The whole photo half of a recipe form: the picked file, validated, re-encoded
 * and on disk — or `null` when no file was picked. Throws `UploadError` for
 * everything the person choosing the file can do something about.
 *
 * One function rather than an exported `processImage`/`storeImage` pair because
 * both callers compose them identically, and the order matters: nothing is
 * written until the image has been read, so a rejected photo leaves no litter.
 */
export async function storePhotoFromForm(form: FormData, field = 'photo'): Promise<string | null> {
	const photo = form.get(field);
	// An empty file input still posts a File — with no bytes in it.
	if (!(photo instanceof File) || photo.size === 0) return null;

	return storeImage(await processImage(photo));
}

/**
 * A copy of an existing photo for a duplicated recipe — the two rows own
 * separate files from the start, so deleting either can't blank the other.
 * Returns `null` when the source has gone missing, which is a duplicate without
 * a photo rather than a failed duplicate.
 */
export function copyImage(sourcePath: string): string | null {
	const source = resolveUpload(sourcePath);
	if (!source) return null;

	const target = newImagePath();
	const absolute = resolveUpload(target);
	if (!absolute) return null;

	try {
		mkdirSync(dirname(absolute), { recursive: true });
		copyFileSync(source, absolute);
		return target;
	} catch {
		return null;
	}
}

/** Removes a stored file. A path that's already gone is a success, not an error. */
export function deleteUpload(relativePath: string | null): void {
	const absolute = relativePath && resolveUpload(relativePath);
	if (!absolute) return;
	rmSync(absolute, { force: true });
}

/** The bytes behind a stored path, or `null` if the file is gone. */
export async function readUpload(relativePath: string): Promise<Buffer | null> {
	const absolute = resolveUpload(relativePath);
	if (!absolute) return null;

	try {
		return await readFile(absolute);
	} catch {
		return null;
	}
}

/** `image/webp` for what we write; the extension for anything older. */
export function uploadContentType(relativePath: string): string {
	const types: Record<string, string> = {
		'.webp': 'image/webp',
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.png': 'image/png'
	};

	return types[extname(relativePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * `recipes/{uuid}.webp` — see rule 2 at the top of this file. Nothing about the
 * recipe is encoded in it on purpose: a file that can be written *before* its
 * row exists is a file no failed insert can leave half-referenced.
 */
function newImagePath(): string {
	return join(RECIPES_DIR, `${crypto.randomUUID()}.webp`);
}

function writeUpload(relativePath: string, data: Buffer): string {
	const absolute = resolveUpload(relativePath);
	if (!absolute) throw new UploadError('store-failed');

	try {
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, data);
	} catch {
		// A full or read-only volume, which the person picking a photo can do
		// nothing about — but silently saving a recipe without its photo would be
		// worse than saying so.
		throw new UploadError('disk-failed');
	}

	return relativePath;
}
