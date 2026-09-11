/**
 * `npm run smoke -- <url> [--commit <sha>] [--timeout <seconds>]`
 *
 * The post-deploy check (→ docs/TESTING.md "Smoke", .github/workflows/smoke.yml).
 * Unauthenticated on purpose — a deployed instance has Google sign-in and
 * nothing else — so it asserts what a stranger can see: the build that is up
 * (waiting for `--commit` to arrive when given, since Coolify deploys take a
 * few minutes after the push), the sign-in page, the guards, the manifest, the E2E door shut.
 */
const [url, ...rest] = process.argv.slice(2);
if (!url) {
	console.error(
		'Usage: npm run smoke -- https://example.com [--commit <sha>] [--timeout <seconds>]'
	);
	process.exit(2);
}
const option = (name: string) => {
	const index = rest.indexOf(name);
	return index === -1 ? undefined : rest[index + 1];
};
const wantedCommit = option('--commit')?.slice(0, 7);
const timeoutMs = Number(option('--timeout') ?? 600) * 1000;
const base = url.replace(/\/$/, '');

type Health = { ok: boolean; version: string; commit: string | null };

async function health(): Promise<Health | null> {
	try {
		const response = await fetch(`${base}/api/health`, { redirect: 'manual' });
		if (!response.ok) return null;
		return (await response.json()) as Health;
	} catch {
		return null;
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long a healthy deploy that reports no commit at all gets before it is
 * taken at its word: a build without `SOURCE_COMMIT` (→ Dockerfile) can never
 * match, and polling it for fifteen minutes would fail a working instance.
 */
const NO_COMMIT_GRACE_MS = 2 * 60 * 1000;

async function waitForBuild(): Promise<Health> {
	const deadline = Date.now() + timeoutMs;
	const graceEnd = Date.now() + NO_COMMIT_GRACE_MS;
	let last: Health | null = null;
	while (Date.now() < deadline) {
		last = await health();
		if (last?.ok && (!wantedCommit || last.commit === wantedCommit)) return last;
		if (last?.ok && wantedCommit && last.commit === null && Date.now() > graceEnd) {
			console.warn(
				`smoke: the deploy reports no commit (APP_COMMIT unset) — cannot confirm ${wantedCommit} is live; checking what is up.`
			);
			return last;
		}
		await sleep(10_000);
	}
	throw new Error(
		wantedCommit
			? `gave up waiting for commit ${wantedCommit}; last seen ${JSON.stringify(last)}`
			: `gave up waiting for a healthy /api/health; last seen ${JSON.stringify(last)}`
	);
}

const checks: [string, () => Promise<void>][] = [
	[
		'/login answers 200 and is the sign-in page',
		async () => {
			const response = await fetch(`${base}/login`, { redirect: 'manual' });
			if (response.status !== 200) throw new Error(`status ${response.status}`);
			const html = await response.text();
			if (!/Choreganized/i.test(html)) throw new Error('page does not mention Choreganized');
		}
	],
	[
		'/home redirects a stranger to /login',
		async () => {
			const response = await fetch(`${base}/home`, { redirect: 'manual' });
			const location = response.headers.get('location') ?? '';
			if (response.status !== 303 || !location.endsWith('/login')) {
				throw new Error(`status ${response.status}, location ${location}`);
			}
		}
	],
	[
		'/api/timers refuses a stranger with 401',
		async () => {
			const response = await fetch(`${base}/api/timers`, { method: 'POST', redirect: 'manual' });
			if (response.status !== 401) throw new Error(`status ${response.status}`);
		}
	],
	[
		'/manifest.webmanifest is served',
		async () => {
			const response = await fetch(`${base}/manifest.webmanifest`, { redirect: 'manual' });
			const type = response.headers.get('content-type') ?? '';
			if (!response.ok || !type.includes('manifest')) {
				throw new Error(`status ${response.status}, content-type ${type}`);
			}
		}
	],
	[
		'password sign-in is disabled (E2E_MODE is off)',
		async () => {
			// Better Auth answers 400 EMAIL_PASSWORD_DISABLED before any user lookup
			// when the method is off, and 401 for an unknown user when it is on — so
			// a junk address is a side-effect-free probe of the flag itself.
			const response = await fetch(`${base}/api/auth/sign-in/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: base },
				body: JSON.stringify({ email: 'smoke-probe@example.invalid', password: 'x' })
			});
			const body = (await response.json().catch(() => ({}))) as { code?: string };
			if (response.status !== 400 || body.code !== 'EMAIL_PASSWORD_DISABLED') {
				throw new Error(
					`sign-in/email answered ${response.status} ${body.code ?? ''} — E2E_MODE is on in a deployed instance!`
				);
			}
		}
	],
	[
		'the component gallery is shut (/dev/kit is a 404)',
		async () => {
			// The other thing the flag opens (→ src/lib/server/e2e-mode.ts).
			const response = await fetch(`${base}/dev/kit`, { redirect: 'manual' });
			if (response.status !== 404) {
				throw new Error(
					`/dev/kit answered ${response.status} — E2E_MODE is on in a deployed instance!`
				);
			}
		}
	]
];

const build = await waitForBuild();
console.log(`smoke: ${base} is up — version ${build.version}, commit ${build.commit ?? 'n/a'}`);

let failed = 0;
for (const [name, check] of checks) {
	try {
		await check();
		console.log(`  ✔ ${name}`);
	} catch (error) {
		failed++;
		console.log(`  ✘ ${name}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
process.exit(failed === 0 ? 0 : 1);
