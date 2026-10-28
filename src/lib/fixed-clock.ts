/**
 * The test clock (→ docs/TESTING.md "The fixed clock", DECISIONS #184).
 *
 * Replaces `Date` with one running `offset` ms ahead of the real clock: it still
 * ticks, so sessions, cooldowns and timers behave, but every run starts on the
 * same afternoon. Installed from this one function in two ways:
 *
 * - every Node process of a Playwright run — the runner's workers, the e2e
 *   server, the build it starts and the seed — through `scripts/fixed-clock.ts`
 *   on `NODE_OPTIONS` (→ playwright.config.ts);
 * - the browser, as an inline script `hooks.server.ts` puts first in `<head>`
 *   when the server runs in E2E mode with `FIXED_CLOCK` set.
 *
 * Self-contained on purpose: the hook sends its source text to the browser.
 */
export function installFixedClock(offset: number): void {
	const Real = Date;
	class Shifted extends Real {
		constructor(...args: unknown[]) {
			if (args.length === 0) super(Real.now() + offset);
			else super(...(args as [number]));
		}

		static now(): number {
			return Real.now() + offset;
		}
	}
	globalThis.Date = Shifted as DateConstructor;
}
