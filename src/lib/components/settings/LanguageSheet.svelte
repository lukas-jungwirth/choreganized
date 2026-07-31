<!--
	Pick a language [6a] (→ SPEC §6). Three rows: follow the device, or one of
	the two languages the app ships.

	The one form in the app whose answer is **a new document, not new data**.
	Changing language has to change `<html lang>`, every server-rendered string
	and the `Intl` formatter each date is written with, all together — and only a
	fresh request does that (→ `$lib/i18n/context.ts`).

	So it reloads explicitly rather than leaning on the browser's default form
	navigation: a plain POST is at the mercy of whatever else might intercept a
	submission, and this was in fact swallowed in testing — the preference was
	saved while the page carried on in the old language, which is the one outcome
	this screen must never produce.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SheetOption from '$lib/components/settings/SheetOption.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { LOCALE_NAMES, LOCALES, messages, type Locale } from '$lib/i18n';

	type Props = {
		/** The member's stored choice; null is "System" (→ `services/household`). */
		chosen: Locale | null;
		/** What "System" would resolve to on this device — *not* the active language. */
		deviceLocale: Locale;
		onclose: () => void;
	};

	let { chosen, deviceLocale, onclose }: Props = $props();

	const m = messages();
	/** Named, or "System" reads as a guess. */
	const detected = $derived(LOCALE_NAMES[deviceLocale]);

	let open = $state(true);
	/** Held from the tap until the reload paints, so the sheet can't be tapped twice. */
	let switching = $state(false);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.settings.language.title} eyebrow={m.settings.account}>
	<!-- One form, one submit button per option: the value travels on the button,
		 so a row *is* the choice rather than a radio you then have to confirm. -->
	<form
		method="POST"
		action="?/language"
		use:enhance={() => {
			switching = true;
			return async ({ result }) => {
				// Deliberately no `update()`: patching this page's data would leave a
				// document whose `<html lang>` and already-rendered strings are in the
				// old language. Ask for the whole thing again instead.
				if (result.type === 'success') {
					location.reload();
					return;
				}
				switching = false;
				open = false;
			};
		}}
	>
		<RowGroup surface="sunken">
			<SheetOption
				name="locale"
				value=""
				label={m.settings.language.system}
				detail={m.settings.language.systemDetail(detected)}
				selected={chosen === null}
				disabled={switching}
			/>

			{#each LOCALES as option (option)}
				<!-- Never translated: somebody looking for German looks for "Deutsch". -->
				<SheetOption
					name="locale"
					value={option}
					label={LOCALE_NAMES[option]}
					selected={chosen === option}
					disabled={switching}
				/>
			{/each}
		</RowGroup>
	</form>

	<p class="note">{m.settings.language.note}</p>
</BottomSheet>

<style>
	.note {
		margin: 14px 2px 22px;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
