/**
 * One ref-counted body-scroll lock for every dialog in the app.
 *
 * A modal `<dialog>` already blocks scrolling behind it everywhere except iOS
 * Safari, so the components still need to pin `<body>` — but they must not each
 * snapshot and restore `document.body.style.overflow` on their own. Nesting a
 * confirm modal inside a sheet (SPEC §5.3 "Delete task") makes the inner dialog
 * snapshot the *outer* dialog's `hidden`, and whichever teardown runs last wins:
 * either the page is left permanently unscrollable with nothing on screen, or
 * the lock is released while a dialog is still open.
 *
 * Counting instead of snapshotting removes the ordering question entirely.
 */
let depth = 0;
let restore = '';

/** Locks page scrolling; call the returned function to release this holder. */
export function lockBodyScroll(): () => void {
	if (depth === 0) {
		restore = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
	}
	depth += 1;

	let released = false;
	return () => {
		// Teardown can fire twice (effect re-run + unmount); only count once.
		if (released) return;
		released = true;

		depth -= 1;
		if (depth === 0) document.body.style.overflow = restore;
	};
}
