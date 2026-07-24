/**
 * The behaviour behind an add field that finishes the word you started
 * (→ SPEC §3.1): which of the household's names to offer for what has been
 * typed, which one the keyboard is on, and whether the list belongs on screen
 * at all.
 *
 * Not a component, because two fields that look nothing alike need exactly the
 * same behaviour — the one-line field pinned above the list [03] and the
 * sheet's "Item" [3a] — and only the chrome differs. Each of them renders
 * `shopping/SuggestionList` from what it reads off here, and hands its
 * keystrokes over to `keydown`.
 *
 * A closure rather than a class (which is what `cook-timer.svelte.ts` is):
 * everything here is derived from the *caller's* two values, so the caller
 * passes them as getters and they stay live. Class fields can't do that —
 * `$derived` in a field initialiser would read a constructor argument that
 * hasn't been assigned yet.
 *
 * The ranking itself is `utils/shopping`'s `matchNames`; this only decides
 * *when*.
 */
import { matchNames } from './utils/shopping';

export type ItemSuggest = ReturnType<typeof itemSuggest>;

/**
 * @param query what has been typed so far
 * @param pool the household's names, most recently used first
 */
export function itemSuggest(query: () => string, pool: () => string[]) {
	/** A list under a field nobody is typing in is clutter, so: only on focus. */
	let focused = $state(false);

	/**
	 * The text the list was last dismissed *for*. Escape and every pick close
	 * the list without arguing about it, and one more keystroke — which changes
	 * the query, and with it the answer to this — brings it back.
	 */
	let dismissedFor = $state<string | null>(null);

	/**
	 * What the keyboard is on, held as a name rather than as an index: the
	 * matches re-rank on every keystroke, and an index would quietly come to
	 * mean a different word. A name that is no longer offered is simply not
	 * active any more.
	 */
	let highlighted = $state<string | null>(null);

	const matches = $derived(matchNames(query(), pool()));
	const open = $derived(focused && matches.length > 0 && dismissedFor !== query());
	/**
	 * The highlighted row, or −1 for "none of them" — which is a real state and
	 * the one every list opens in: Enter must add exactly what was typed until
	 * somebody says otherwise.
	 */
	const active = $derived(open && highlighted !== null ? matches.indexOf(highlighted) : -1);

	/**
	 * Up and down through the rows *and through "none of them"*, wrapping: past
	 * the last row is what you typed, and one more down is the first row again.
	 * The slot for "none" is index 0 of the cycle, which is why this counts in
	 * `active + 1`.
	 */
	function move(delta: number): void {
		const slots = matches.length + 1;
		const next = (active + 1 + delta + slots) % slots;
		highlighted = next === 0 ? null : matches[next - 1];
	}

	/** A row was taken — by tap, or by Enter. Returns it, for the field to use. */
	function pick(name: string): string {
		dismissedFor = name;
		highlighted = null;
		return name;
	}

	/** Escape, or a field that is done with the list for what's in it now. */
	function dismiss(): void {
		dismissedFor = query();
		highlighted = null;
	}

	return {
		get focused() {
			return focused;
		},
		set focused(value: boolean) {
			focused = value;
		},
		get matches() {
			return matches;
		},
		get open() {
			return open;
		},
		get active() {
			return active;
		},
		pick,
		dismiss,

		/**
		 * The keystrokes the field hands over, and the only one that answers
		 * back: Enter on a highlighted row returns that name. What "taking" it
		 * means is the field's own business — the quick field puts it on the
		 * list, the sheet fills itself in with it.
		 */
		keydown(event: KeyboardEvent): string | null {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				// An arrow at a dismissed list is a request to see it again.
				dismissedFor = null;
				if (!open) return null;
				// Or the caret would run to one end of the field as we move.
				event.preventDefault();
				move(event.key === 'ArrowDown' ? 1 : -1);
				return null;
			}

			if (!open) return null;

			if (event.key === 'Escape') {
				// The sheet is a <dialog>, so an Escape left alone here would take
				// the half-filled form with the list (→ ui/BottomSheet, which stands
				// down for a keystroke somebody else has already answered).
				event.preventDefault();
				dismiss();
				return null;
			}

			if (event.key === 'Enter' && active >= 0) {
				// Not the form's submit: this Enter picks a suggestion. The field
				// submits afterwards if that is what it does with one.
				event.preventDefault();
				return pick(matches[active]);
			}

			return null;
		}
	};
}
