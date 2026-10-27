/**
 * How often one email address may be sent a sign-in code (→ `auth.ts`,
 * DECISIONS #183). Better Auth's own limit counts per IP, so someone with many
 * addresses to send *from* could still bury one inbox in codes — and every one
 * goes out through the household's own mail account, which its provider may
 * throttle or block. This counts per *recipient*: one code a minute, five an
 * hour.
 *
 * In memory, on purpose: the app is one process, the window is an hour, and a
 * restart forgetting it costs at most one extra hour's worth. The answer never
 * depends on whether the address has an account, so it reveals nothing.
 */
import { env } from '$env/dynamic/private';
import { e2eMode } from './e2e-mode';

export type SendLimits = {
	/** Seconds between two codes to one address. */
	cooldownSeconds: number;
	/** Codes per address in any rolling hour. */
	perHour: number;
};

export const SEND_LIMITS: SendLimits = { cooldownSeconds: 60, perHour: 5 };

/**
 * The limits this server runs with. Only E2E mode may shorten the cooldown
 * (`SIGN_IN_CODE_COOLDOWN_SECONDS`), so a journey can watch "Send again" come
 * back without waiting a minute; a deploy always gets `SEND_LIMITS`.
 */
export function activeSendLimits(): SendLimits {
	const override = Number(env.SIGN_IN_CODE_COOLDOWN_SECONDS);
	if (e2eMode() && override > 0) return { ...SEND_LIMITS, cooldownSeconds: override };
	return SEND_LIMITS;
}

export type SendCheck =
	{ ok: true } | { ok: false; reason: 'cooldown' | 'hourly'; retryAfterSeconds: number };

const HOUR = 60 * 60 * 1000;

/** Past this many tracked addresses, a check also sweeps the stale ones. */
const SWEEP_AT = 1000;

export function createSendLimiter(limits: SendLimits) {
	/** Send times per address, oldest first, none older than an hour. */
	const sends = new Map<string, number[]>();

	function recent(address: string, now: number): number[] {
		const kept = (sends.get(address) ?? []).filter((at) => now - at < HOUR);
		if (kept.length) sends.set(address, kept);
		else sends.delete(address);
		return kept;
	}

	function sweep(now: number) {
		for (const address of [...sends.keys()]) recent(address, now);
	}

	return {
		/** May `email` be sent a code now? Doesn't count it — `record` does. */
		check(email: string, now = Date.now()): SendCheck {
			if (sends.size > SWEEP_AT) sweep(now);
			const times = recent(normalise(email), now);
			const last = times.at(-1);

			const cooldownMs = limits.cooldownSeconds * 1000;
			if (last !== undefined && now - last < cooldownMs) {
				return {
					ok: false,
					reason: 'cooldown',
					retryAfterSeconds: seconds(last + cooldownMs - now)
				};
			}
			if (times.length >= limits.perHour) {
				// The oldest of the hour's sends leaving the window frees a slot.
				return { ok: false, reason: 'hourly', retryAfterSeconds: seconds(times[0] + HOUR - now) };
			}
			return { ok: true };
		},

		record(email: string, now = Date.now()) {
			const address = normalise(email);
			sends.set(address, [...recent(address, now), now]);
		},

		/** Takes back the newest send — the mail never left, so it shouldn't count. */
		forget(email: string) {
			const address = normalise(email);
			const times = sends.get(address);
			times?.pop();
			if (times && times.length === 0) sends.delete(address);
		}
	};
}

/** Better Auth lowercases the address before it looks anything up; so do we. */
function normalise(email: string): string {
	return email.trim().toLowerCase();
}

function seconds(ms: number): number {
	return Math.max(1, Math.ceil(ms / 1000));
}
