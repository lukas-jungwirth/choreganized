/**
 * Freshness without SSE (v1): when the app comes back to the foreground —
 * unlocking the phone, switching back to the tab — re-run every active load, so
 * a housemate's changes are on screen by the time you look
 * (→ docs/ARCHITECTURE.md "Freshness"). Form actions already invalidate.
 *
 * Call it from an `$effect` in the app layout; the returned teardown is the
 * effect's cleanup.
 */
import { invalidateAll } from '$app/navigation';

/** `visibilitychange` and `focus` both fire on a tab switch — coalesce them. */
const MIN_INTERVAL_MS = 1000;

export function refetchOnFocus(): () => void {
	// Seeded with "now" so regaining focus moments after mount doesn't re-fetch
	// data the page has only just loaded.
	let lastRefetch = Date.now();

	const refetch = () => {
		if (document.visibilityState !== 'visible') return;
		if (Date.now() - lastRefetch < MIN_INTERVAL_MS) return;
		lastRefetch = Date.now();
		void invalidateAll();
	};

	document.addEventListener('visibilitychange', refetch);
	window.addEventListener('focus', refetch);

	return () => {
		document.removeEventListener('visibilitychange', refetch);
		window.removeEventListener('focus', refetch);
	};
}
