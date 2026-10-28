/**
 * `node --import ./scripts/fixed-clock.ts …` — starts this process's clock at
 * `FIXED_CLOCK` (an ISO instant), counted from `FIXED_CLOCK_ANCHOR` (the real
 * epoch ms the Playwright run began), so every process of one run shares one
 * clock however late it starts. Without both variables it does nothing.
 * (→ src/lib/fixed-clock.ts, playwright.config.ts)
 */
import { installFixedClock } from '../src/lib/fixed-clock.ts';

const at = Date.parse(process.env.FIXED_CLOCK ?? '');
const anchor = Number(process.env.FIXED_CLOCK_ANCHOR);

if (Number.isFinite(at) && Number.isFinite(anchor) && anchor > 0) {
	installFixedClock(at - anchor);
}
