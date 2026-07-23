/**
 * Nightly SQLite backup (→ plan 11, DECISIONS #91). In-process, no extra infra.
 *
 * better-sqlite3 exposes SQLite's **Online Backup API** (`db.backup()`), which
 * copies a live, WAL-mode database into a consistent standalone snapshot without
 * locking writers out and without shelling to the `sqlite3` binary — which the
 * slim runtime image doesn't ship. A plain `cp` of the `.db` while WAL writes
 * are in flight would capture a torn file; this does not.
 *
 * One file per day at `${backups}/YYYY-MM-DD.db`, kept for 14 days. The cron
 * registry (→ cron.ts) gates it to once per server-local day from 03:00.
 *
 * **Restore** (full procedure in docs/plans/11-pwa-deploy.md): stop the app,
 * replace the live DB with a chosen snapshot, delete the `-wal`/`-shm` sidecars,
 * restart. Each snapshot is a complete database — no replay needed.
 */
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from './db';

/** Days of snapshots to keep. */
const RETENTION_DAYS = 14;

/** `2026-07-23.db` — the only files prune will ever touch. */
const BACKUP_NAME = /^(\d{4}-\d{2}-\d{2})\.db$/;

/** Server-local `YYYY-MM-DD` — the day both the filename and the cron gate use. */
export function serverDay(now: Date): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Where daily snapshots live — beside the DB by default, overridable. */
function backupsDir(): string {
	if (env.BACKUPS_DIR) return resolve(env.BACKUPS_DIR);
	const database = env.DATABASE_PATH ?? './data/choreganized.db';
	return resolve(join(dirname(database), 'backups'));
}

export type BackupResult = { file: string; pages: number; pruned: number };

/**
 * Write today's snapshot and prune anything past the retention window.
 *
 * The copy goes to a `.tmp` sibling first and is renamed into place, so a crash
 * mid-backup can never leave a half-written file wearing today's date. Renaming
 * onto an existing same-day file is atomic, which makes re-running idempotent.
 */
export async function backUpDatabase(now: Date = new Date()): Promise<BackupResult> {
	const dir = backupsDir();
	mkdirSync(dir, { recursive: true });

	const file = join(dir, `${serverDay(now)}.db`);
	const tmp = `${file}.tmp`;
	rmSync(tmp, { force: true });

	const { totalPages } = await db.$client.backup(tmp);
	renameSync(tmp, file);

	return { file, pages: totalPages, pruned: prune(dir, now) };
}

/** Delete dated snapshots older than the retention window (lexical = chronological). */
function prune(dir: string, now: Date): number {
	const cutoff = serverDay(new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000));

	let removed = 0;
	for (const name of readdirSync(dir)) {
		const match = name.match(BACKUP_NAME);
		if (match && match[1] < cutoff) {
			rmSync(join(dir, name), { force: true });
			removed++;
		}
	}
	return removed;
}
