/**
 * GitHub issues — the one module that talks to api.github.com (→ plan 16).
 *
 * A sibling of `push.ts`, not a service: it knows an HTTP API and nothing about
 * households. Everything it can fail at is a typed `GitHubError` carrying two
 * things the caller actually needs — *why*, and **whether trying again could
 * ever help**. Re-sending against a token the repository has refused, every
 * five minutes, forever, is a log full of noise and a rate limit waiting to
 * happen; a 503 is worth another go in ten minutes.
 *
 * The token is read per call, never logged, never returned, and never put in a
 * `lastError` — a response body can quote the request that produced it, so only
 * the code and the status ever leave this file (→ `services/feedback.ts`).
 *
 * Unlike the Gemini key, which is per household and lives in the database
 * because it bills the household (→ SPEC §4.7), this is the *app's* credential
 * for the *app's* repository. It belongs in the environment beside the VAPID
 * keys, and a household never sees or sets it (→ DECISIONS #135).
 */
import { env } from '$env/dynamic/private';
import { appVersion } from './version';

/** Where the issues go when nothing overrides it. */
const DEFAULT_REPO = 'lukas-jungwirth/choreganized';

const API = 'https://api.github.com';

/** A hung socket in a cron sweep is worse than a late issue (→ `push.ts`). */
const REQUEST_TIMEOUT_MS = 10_000;

export type GitHubErrorCode =
	/** No token configured. A guard, not a path — the caller checks first. */
	| 'unconfigured'
	/** 401 — the token is wrong, expired, or revoked. */
	| 'bad-token'
	/** 403 with quota left, or 404: the token cannot see this repository. */
	| 'no-access'
	/** 429, or a 403 that spent the quota. The one failure with a *when*. */
	| 'rate-limited'
	/** 422 / 410 — GitHub understood and refused: a missing label, issues off. */
	| 'rejected'
	/** 5xx, DNS, a refused connection, the timeout firing. */
	| 'unreachable';

export class GitHubError extends Error {
	constructor(
		readonly code: GitHubErrorCode,
		/** Whether the identical request could succeed later. */
		readonly retryable: boolean,
		/** What GitHub asked us to wait, when it said so. */
		readonly retryAfterMs?: number
	) {
		super(code);
		this.name = 'GitHubError';
	}
}

/** Whether a token is set at all. Mirrors `pushConfigured()`. */
export function githubConfigured(): boolean {
	return Boolean(token());
}

/** The repository issues are filed against (→ `.env.example`). */
export function feedbackRepo(): string {
	return env.GITHUB_FEEDBACK_REPO?.trim() || DEFAULT_REPO;
}

/** Read per call: `$env/dynamic/private` is empty while the app is building. */
function token(): string {
	return env.GITHUB_FEEDBACK_TOKEN?.trim() ?? '';
}

export type NewIssue = {
	title: string;
	body: string;
	/**
	 * Labels that **already exist on the repository**. A fine-grained token
	 * scoped to Issues may not be allowed to create one, and GitHub answers a
	 * label it doesn't know with a 422 — which is `rejected`, i.e. not
	 * retryable, i.e. a report that never lands. The labels are bootstrapped
	 * once with `gh label create` (→ docs/plans/16-feedback.md).
	 */
	labels: string[];
};

export type CreatedIssue = { number: number; url: string };

/**
 * File one issue. Throws `GitHubError` and nothing else — a caller that treats
 * every failure as "try later" only has to catch the one type.
 */
export async function createIssue(input: NewIssue): Promise<CreatedIssue> {
	const response = await call(`/repos/${feedbackRepo()}/issues`, {
		method: 'POST',
		body: JSON.stringify(input)
	});

	if (!response.ok) throw failure(response);

	const issue = (await response.json()) as { number?: number; html_url?: string };
	if (typeof issue.number !== 'number') throw new GitHubError('rejected', false);

	return { number: issue.number, url: issue.html_url ?? '' };
}

/**
 * Find an issue already carrying this report's marker — the answer to "did my
 * last attempt actually land?" after a response we never saw.
 *
 * **Best effort, by design.** GitHub's search index lags issue creation by
 * seconds to minutes, so a retry that runs promptly can genuinely miss an issue
 * that exists. That is why this returns `null` rather than throwing on a failed
 * search: a duplicate is a nuisance, a lost report is not, and the marker is
 * what makes two of them recognisable as one report afterwards
 * (→ DECISIONS #135).
 */
export async function findIssueByMarker(marker: string): Promise<CreatedIssue | null> {
	const query = encodeURIComponent(`repo:${feedbackRepo()} in:body "${marker}"`);

	let response: Response;
	try {
		response = await call(`/search/issues?q=${query}&per_page=1`, { method: 'GET' });
	} catch {
		return null;
	}

	if (!response.ok) return null;

	const found = (await response.json()) as {
		items?: { number?: number; html_url?: string }[];
	};
	const first = found.items?.[0];

	return typeof first?.number === 'number'
		? { number: first.number, url: first.html_url ?? '' }
		: null;
}

/**
 * One request, with the headers GitHub insists on. A missing `User-Agent` is
 * refused outright, and the API version header is what stops a future default
 * changing the shapes above under us.
 *
 * A transport failure — DNS, a refused connection, the timeout — is
 * `unreachable` here rather than a raw `TypeError`, so every throw out of this
 * module is a `GitHubError`.
 */
async function call(path: string, init: RequestInit): Promise<Response> {
	const bearer = token();
	if (!bearer) throw new GitHubError('unconfigured', false);

	try {
		return await fetch(`${API}${path}`, {
			...init,
			headers: {
				authorization: `Bearer ${bearer}`,
				accept: 'application/vnd.github+json',
				'x-github-api-version': '2022-11-28',
				'content-type': 'application/json',
				'user-agent': `choreganized/${appVersion().label}`
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch {
		throw new GitHubError('unreachable', true);
	}
}

/**
 * A failed response as the code the caller acts on.
 *
 * The 403 split is the subtle one: GitHub answers both "you may not touch this
 * repository" and "you have spent your quota" with 403, and the two want
 * opposite treatment. `x-ratelimit-remaining: 0` is what tells them apart.
 */
function failure(response: Response): GitHubError {
	const status = response.status;
	const spentQuota = response.headers.get('x-ratelimit-remaining') === '0';

	if (status === 401) return new GitHubError('bad-token', false);
	if (status === 429 || (status === 403 && spentQuota)) {
		return new GitHubError('rate-limited', true, retryAfterMs(response));
	}
	if (status === 403 || status === 404) return new GitHubError('no-access', false);
	if (status === 410 || status === 422) return new GitHubError('rejected', false);
	if (status >= 500) return new GitHubError('unreachable', true);

	// Anything else is a shape we don't know; treating it as permanent is the
	// safe half — a parked row is visible in the database, a hot loop is not.
	return new GitHubError('rejected', false);
}

/** `retry-after` (seconds) or `x-ratelimit-reset` (epoch seconds), if either is sane. */
function retryAfterMs(response: Response): number | undefined {
	const after = Number(response.headers.get('retry-after'));
	if (Number.isFinite(after) && after > 0) return after * 1000;

	const reset = Number(response.headers.get('x-ratelimit-reset'));
	if (!Number.isFinite(reset) || reset <= 0) return undefined;

	const waitMs = reset * 1000 - Date.now();
	return waitMs > 0 ? waitMs : undefined;
}
