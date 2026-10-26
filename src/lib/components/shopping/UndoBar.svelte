<!--
	"**Avocado** checked off · Undo" — the few seconds after a tick, above the
	tab bar.

	A check is one tap and the row leaves for "Recently bought", which is folded
	up: right when you'd notice you ticked the wrong line, it is also the moment
	the row is hardest to find. So the way back sits under your thumb for a few
	seconds, and then gets out of the way — nothing is lost when it goes, because
	the row is in the section below and un-ticking it there does exactly the same
	thing (which is what keeps this timer honest for anyone who needs longer than
	five seconds).

	It is the one place the app inverts. Everything else here is cream and white,
	so a toast has a harder job than being pretty: it must not read as a row. Sage
	would collide with the checked-state sage; a cream pill would dissolve into
	the sheets. Inverted `--ink` (warmed to `--toast`, so it doesn't go cold next
	to the paper) is the only surface on the palette that says "message, not list"
	at a glance (→ DECISIONS #107). The sage dot and the sage "Undo" keep it
	Choreganized's rather than a system snackbar's.

	Furniture-wise it borrows the timer dock's framing — the 480px column, the
	`rise` — and sits *above* the dock when one is up, the way the FAB does
	(→ DECISIONS #104). Not `ui/Banner`: a banner is an alert you read once, in
	normal flow.

	Undoing posts the same `?/toggle` action a row does, through the page's own
	optimistic handler, so the item is back in its store group before the server
	answers.
-->
<script lang="ts">
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import UndoToast from '$lib/components/ui/UndoToast.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';

	type Props = {
		/** What was just ticked off. */
		item: ShoppingListItem;
		/** The page's handler for putting it back — the same one the rows use. */
		undo: SubmitFunction;
		/** Its few seconds are up, or the undo is away. */
		onclose: () => void;
		duration?: number;
	};

	let { item, undo, onclose, duration = 5000 }: Props = $props();

	const m = messages();
</script>

<!-- `item` is the key on purpose: a second tick replaces this bar, and the new
	 one gets its own few seconds rather than what was left of these. -->
<UndoToast
	message={m.shopping.undo.checked(item.name)}
	action="?/toggle"
	fields={{ id: item.id, checked: 'false' }}
	label={m.shopping.undo.action}
	{undo}
	{onclose}
	key={item}
	{duration}
>
	{#snippet icon()}
		<!-- Its own sage, not the list's: this circle sits on the dark pill in both
			 themes, so it lifts with the rest of the toast (→ `--toast-dot`). -->
		<CheckCircle checked size={20} color="var(--toast-dot)" />
	{/snippet}
</UndoToast>
