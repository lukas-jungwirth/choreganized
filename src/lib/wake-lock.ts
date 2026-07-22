/**
 * Keep the screen on while cook mode is open (→ SPEC §4.6).
 *
 * Hands covered in flour can't tap a phone awake every thirty seconds, which is
 * the entire argument for this file. Call it from an `$effect` and let the
 * returned teardown be the effect's cleanup, the same shape as
 * `refetchOnFocus` and `lockBodyScroll`.
 *
 * Two things make it more than one line:
 *
 * - **The browser takes the lock away.** Locking the phone, switching apps, even
 *   a tab switch releases it, and nothing re-acquires it for you — so the lock
 *   is requested again every time the page becomes visible.
 * - **It can fail for perfectly ordinary reasons** and must not matter: no
 *   support (Safari before 16.4), a battery-saver refusal, an insecure origin.
 *   Everything here is best-effort; the screen timing out is a worse cook mode,
 *   not a broken one.
 */
export function keepScreenAwake(): () => void {
	if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return () => {};

	let lock: WakeLockSentinel | null = null;
	let released = false;

	async function acquire() {
		// `request()` throws on a hidden document, and re-requesting while we
		// already hold one would leak a sentinel.
		if (released || lock || document.visibilityState !== 'visible') return;

		try {
			const sentinel = await navigator.wakeLock.request('screen');

			// The teardown may have run while this was in flight.
			if (released) {
				void sentinel.release();
				return;
			}

			lock = sentinel;
			// The browser dropping it is not an error and not our doing — forget the
			// sentinel so the next `visibilitychange` asks for a fresh one.
			sentinel.addEventListener('release', () => {
				if (lock === sentinel) lock = null;
			});
		} catch {
			// Refused. The screen will dim; the recipe is still on it.
		}
	}

	void acquire();
	document.addEventListener('visibilitychange', acquire);

	return () => {
		released = true;
		document.removeEventListener('visibilitychange', acquire);
		void lock?.release();
		lock = null;
	};
}
