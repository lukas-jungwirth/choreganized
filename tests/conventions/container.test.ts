/**
 * The container's start (→ docs/BACKUP.md, DECISIONS #157). Four files have to agree: the
 * Dockerfile runs scripts/docker-entrypoint.sh, the script decides from the LITESTREAM_*
 * variables whether Litestream runs, litestream.yml reads those variables, and
 * .env.example documents them. The script runs here for real, under `sh`, with
 * `litestream` and the app replaced by stubs that log how they were called.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'vitest';

const SCRIPT = 'scripts/docker-entrypoint.sh';
const read = (path: string) => readFileSync(path, 'utf8');

const LITESTREAM_ENV = {
	LITESTREAM_ACCESS_KEY_ID: 'test-key-id',
	LITESTREAM_SECRET_ACCESS_KEY: 'test-secret',
	LITESTREAM_S3_ENDPOINT: 'http://localhost:9000',
	LITESTREAM_S3_BUCKET: 'test-bucket',
	LITESTREAM_S3_REGION: 'us-east-1',
	LITESTREAM_REPLICA_PATH: 'choreganized/test'
};

type StartOptions = {
	/** What `litestream restore` exits with. */
	restoreExit?: number;
	/** Whether `litestream restore` writes a database, as it does into an empty volume. */
	restoreWrites?: boolean;
	/** Files already on the volume, by name, with their contents. */
	volume?: Record<string, string>;
};

/**
 * Run the start script with `env` only (nothing leaks in from this shell), on a volume
 * in a temp dir. Paths in what comes back read `/data/…`, as they would in the image.
 */
function start(env: Record<string, string>, options: StartOptions = {}) {
	const root = mkdtempSync(join(tmpdir(), 'choreganized-start-'));
	const bin = join(root, 'bin');
	const data = join(root, 'data');
	const database = join(data, 'choreganized.db');
	const log = join(root, 'calls.log');
	mkdirSync(bin);
	mkdirSync(data);
	for (const [name, text] of Object.entries(options.volume ?? {})) {
		mkdirSync(dirname(join(data, name)), { recursive: true });
		writeFileSync(join(data, name), text);
	}

	const stub = (name: string, body: string) => {
		writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> '${log}'\n${body}`);
		chmodSync(join(bin, name), 0o755);
	};
	const write = options.restoreWrites ? `echo restored > '${database}'` : ':';
	stub(
		'litestream',
		`if [ "$1" = restore ]; then ${write}; exit ${options.restoreExit ?? 0}; fi\n`
	);
	stub('app', 'exit 0\n');

	try {
		const result = spawnSync('/bin/sh', [SCRIPT, 'app', 'build/index.js'], {
			env: { PATH: `${bin}:/usr/bin:/bin`, DATABASE_PATH: database, ...env },
			encoding: 'utf8'
		});
		const inImage = (text: string) => text.replaceAll(data, '/data');
		const calls = existsSync(log) ? inImage(read(log)).trim().split('\n') : [];
		const files = Object.fromEntries(
			readdirSync(data, { recursive: true, withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) => {
					const path = join(entry.parentPath, entry.name);
					return [
						inImage(path).replace(/pre-restore-\d{8}T\d{6}Z/, 'pre-restore-<time>'),
						read(path)
					];
				})
		);
		return {
			status: result.status,
			stdout: inImage(result.stdout),
			stderr: result.stderr,
			calls,
			files
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe('the start script', () => {
	it('starts the app as before when no Litestream variable is set', () => {
		const { status, calls } = start({});
		assert.equal(status, 0);
		assert.deepEqual(calls, ['app build/index.js'], 'no Litestream at all');
	});

	it('treats a variable set to nothing as unset', () => {
		const blank = Object.fromEntries(Object.keys(LITESTREAM_ENV).map((name) => [name, '']));
		assert.deepEqual(start(blank).calls, ['app build/index.js']);
	});

	it('restores only into an empty volume, then runs the app under Litestream', () => {
		const { status, calls } = start(LITESTREAM_ENV);
		assert.equal(status, 0);
		assert.deepEqual(calls, [
			'litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists /data/choreganized.db',
			'litestream replicate -config /etc/litestream.yml -exec app build/index.js'
		]);
	});

	it('says so in the log when the database came from the replica', () => {
		assert.match(
			start(LITESTREAM_ENV, { restoreWrites: true }).stdout,
			/Restored \/data\/choreganized\.db/
		);
		assert.doesNotMatch(
			start(LITESTREAM_ENV, { volume: { 'choreganized.db': 'live' } }).stdout,
			/Restored/,
			'an existing database was kept, not restored'
		);
	});

	it('puts a staged restore in place and keeps the database it replaces', () => {
		const { status, stdout, files } = start(
			{},
			{
				volume: {
					'choreganized.db': 'live',
					'choreganized.db-wal': 'live wal',
					'choreganized.db-shm': 'live shm',
					'.choreganized.db-litestream/ltx/0/1.ltx': 'position',
					'choreganized.db.restore': 'staged',
					'choreganized.db.restore-wal': 'staged wal',
					'choreganized.db.restore-shm': 'staged shm'
				}
			}
		);
		assert.equal(status, 0);
		assert.match(stdout, /previous database is in \/data\/pre-restore-/);
		assert.deepEqual(files, {
			'/data/choreganized.db': 'staged',
			'/data/choreganized.db-wal': 'staged wal',
			'/data/pre-restore-<time>/choreganized.db': 'live',
			'/data/pre-restore-<time>/choreganized.db-wal': 'live wal',
			'/data/pre-restore-<time>/choreganized.db-shm': 'live shm',
			'/data/pre-restore-<time>/.choreganized.db-litestream/ltx/0/1.ltx': 'position'
		});
	});

	it('swaps before the replica restore runs, so that restore finds a database and skips', () => {
		const { stdout, calls } = start(LITESTREAM_ENV, {
			volume: { 'choreganized.db.restore': 'staged' }
		});
		const swapped = stdout.indexOf('Put the staged');
		assert.ok(swapped >= 0, 'the staged file was put in place');
		assert.ok(swapped < stdout.indexOf('Litestream on'), 'before Litestream was started');
		assert.ok(calls[0].includes('-if-db-not-exists'));
		assert.doesNotMatch(stdout, /Restored/);
	});

	it('refuses to start half-configured, and names what is missing', () => {
		const {
			LITESTREAM_S3_REGION: _,
			LITESTREAM_SECRET_ACCESS_KEY: __,
			...partial
		} = LITESTREAM_ENV;
		const { status, stderr, calls } = start(partial);
		assert.equal(status, 1);
		assert.match(stderr, /LITESTREAM_SECRET_ACCESS_KEY LITESTREAM_S3_REGION/);
		assert.deepEqual(calls, [], 'neither Litestream nor the app ran');
	});

	it('does not start the app when the restore fails', () => {
		const { status, calls } = start(LITESTREAM_ENV, { restoreExit: 1 });
		assert.notEqual(status, 0);
		assert.equal(calls.length, 1, 'only the restore ran');
		assert.ok(calls[0].startsWith('litestream restore'));
	});
});

describe('the Litestream pieces agree', () => {
	const script = read(SCRIPT);
	const required = script.match(/^REQUIRED='([^']+)'/m)?.[1].split(' ') ?? [];
	const config = read('litestream.yml');
	const used = Array.from(config.matchAll(/\$\{(\w+)\}/g), (m) => m[1]);

	it('the script checks every variable litestream.yml reads', () => {
		assert.ok(required.length > 0, `${SCRIPT} has a REQUIRED list`);
		for (const name of used.filter((name) => name !== 'DATABASE_PATH')) {
			assert.ok(required.includes(name), `litestream.yml reads ${name}; add it to REQUIRED`);
		}
	});

	it('litestream.yml reads every setting the script requires, except the two credentials', () => {
		for (const name of required) {
			if (name === 'LITESTREAM_ACCESS_KEY_ID' || name === 'LITESTREAM_SECRET_ACCESS_KEY') {
				// Litestream reads these from the environment itself. In the file they'd be
				// one YAML quoting mistake away from a broken start.
				assert.ok(!used.includes(name), `${name} stays out of litestream.yml`);
			} else {
				assert.ok(
					used.includes(name),
					`the script requires ${name}, litestream.yml never reads it`
				);
			}
		}
	});

	it('.env.example documents every variable, without a value', () => {
		const example = read('.env.example');
		for (const name of required) {
			assert.match(
				example,
				new RegExp(`^# ${name}=`, 'm'),
				`.env.example lists ${name}, commented out`
			);
		}
	});

	it('keeps the request-heavy pass off its 15 s default (B2 free tier)', () => {
		const interval = config.match(/^l0-retention-check-interval:\s*(\S+)/m)?.[1];
		assert.equal(interval, '1h', 'the 15 s default LISTs about 11,500 times a day');
	});

	it('the image pins Litestream and starts through the script', () => {
		const dockerfile = read('Dockerfile');
		assert.match(
			dockerfile,
			/^FROM litestream\/litestream:\d+\.\d+\.\d+@sha256:[0-9a-f]{64} AS litestream$/m,
			'an exact release, and its digest'
		);
		assert.ok(dockerfile.includes('COPY litestream.yml /etc/litestream.yml'));
		assert.ok(dockerfile.includes(`COPY ${SCRIPT} ./${SCRIPT}`));
		assert.ok(dockerfile.includes(`ENTRYPOINT ["/bin/sh", "/app/${SCRIPT}"]`));
		assert.ok(dockerfile.includes('CMD ["node", "build/index.js"]'));
	});
});
