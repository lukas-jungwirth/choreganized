<!--
	Pick an appearance [6a] (→ SPEC §6). Three rows: follow the device, or pin
	one of the two themes.

	Deliberately *not* the language sheet's reload. Every colour in the app is a
	custom property on `:root` (→ app.css), so a theme change is a repaint and
	nothing more — no string, no `<html lang>`, no `Intl` formatter moves. The
	action writes the cookie, SvelteKit re-runs the loads, and the root layout
	puts the new value back on `<html data-theme>`. The whole switch is one frame.

	The one thing only this side knows is what "System" currently resolves to:
	`prefers-color-scheme` never reaches the server (→ hooks.server.ts), so the
	detail line is answered by `matchMedia` here and kept live, in case the phone
	flips to dark while the sheet is open.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SheetOption from '$lib/components/settings/SheetOption.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import { THEMES, type Theme } from '$lib/theme';

	type Props = {
		/** The device's stored choice; null is "System" (→ `$lib/theme`). */
		chosen: Theme | null;
		onclose: () => void;
	};

	let { chosen, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	/** Held from the tap until the repaint lands, so a row can't be tapped twice. */
	let switching = $state(false);

	/**
	 * What "System" resolves to on this device, *ignoring* the choice — with dark
	 * pinned on a light phone the detail must still read "currently Light", which
	 * is the one thing this line must not get wrong.
	 *
	 * Read straight away rather than defaulted and corrected in the effect: this
	 * sheet only ever mounts from a tap, so `window` is always there, and an
	 * initial "currently Light" on a dark phone would be wrong on the very first
	 * frame. The effect below only keeps it *live*, for a phone that flips while
	 * the sheet is open.
	 */
	const COLOR_QUERY = '(prefers-color-scheme: dark)';

	let deviceTheme = $state<Theme>(window.matchMedia(COLOR_QUERY).matches ? 'dark' : 'light');

	$effect(() => {
		const query = window.matchMedia(COLOR_QUERY);
		const read = () => (deviceTheme = query.matches ? 'dark' : 'light');

		query.addEventListener('change', read);
		return () => query.removeEventListener('change', read);
	});

	const detected = $derived(m.settings.theme[deviceTheme]);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.settings.theme.title} eyebrow={m.settings.account}>
	<!-- One form, one submit button per option: the value travels on the button,
		 so a row *is* the choice rather than a radio you then have to confirm. -->
	<form
		method="POST"
		action="?/theme"
		use:enhance={() => {
			switching = true;
			return async ({ update }) => {
				// `update()` re-runs the load functions, which is what carries the new
				// theme to the root layout and onto `<html data-theme>`. Plain
				// `update()`: the rows are submit buttons rather than fields, so there
				// is nothing for a form reset to clear, and nothing here scrolls.
				await update();
				switching = false;
				open = false;
			};
		}}
	>
		<RowGroup surface="sunken">
			<SheetOption
				name="theme"
				value=""
				label={m.settings.theme.system}
				detail={m.settings.theme.systemDetail(detected)}
				selected={chosen === null}
				disabled={switching}
			/>

			{#each THEMES as option (option)}
				<SheetOption
					name="theme"
					value={option}
					label={m.settings.theme[option]}
					selected={chosen === option}
					disabled={switching}
				/>
			{/each}
		</RowGroup>
	</form>

	<p class="note">{m.settings.theme.note}</p>
</BottomSheet>

<style>
	.note {
		margin: 14px 2px 22px;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
