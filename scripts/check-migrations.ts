/**
 * Schema drift check — `npm run check:migrations` (→ docs/TESTING.md "Static").
 *
 * `schema.ts` edited without `npm run db:generate` is a change that compiles,
 * passes every test against an in-memory database (they migrate from the same
 * folder), and then fails in production at the first query on the missing
 * column. So: copy the migrations folder somewhere disposable, ask drizzle-kit
 * to generate against *that*, and fail if it produced anything.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import config from '../drizzle.config.ts';

// The same two paths drizzle-kit itself reads, so moving the folder in the
// config cannot leave this checking an old one.
const MIGRATIONS = config.out!;
const SCHEMA = config.schema as string;

const scratch = mkdtempSync(join(tmpdir(), 'choreganized-migrations-'));
const out = join(scratch, 'migrations');
cpSync(MIGRATIONS, out, { recursive: true });

const sqlFiles = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.sql'));
const before = sqlFiles(out).length;

const result = spawnSync(
	'npx',
	[
		'drizzle-kit',
		'generate',
		'--dialect',
		'sqlite',
		'--schema',
		SCHEMA,
		'--out',
		out,
		'--name',
		'drift'
	],
	{ encoding: 'utf8' }
);

const after = sqlFiles(out).length;
rmSync(scratch, { recursive: true, force: true });

if (result.error || result.status !== 0) {
	process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
	console.error(
		result.error
			? `check:migrations — could not run drizzle-kit: ${result.error.message}`
			: 'check:migrations — drizzle-kit failed (see above).'
	);
	process.exit(result.status ?? 1);
}

if (after > before) {
	console.error(
		'check:migrations — schema.ts has changes that no migration carries.\n' +
			'Run `npm run db:generate`, read the SQL it wrote, and commit it with the schema change.'
	);
	process.exit(1);
}

console.log(`check:migrations — ${before} migrations, schema.ts in sync.`);
