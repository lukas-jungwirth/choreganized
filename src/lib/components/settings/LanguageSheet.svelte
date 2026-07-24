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
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { LOCALE_NAMES, LOCALES, messages, type Locale } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';

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
			<button type="submit" class="option" name="locale" value="" disabled={switching}>
				<span class="what">
					<span class="title">{m.settings.language.system}</span>
					<span class="detail">{m.settings.language.systemDetail(detected)}</span>
				</span>
				{#if chosen === null}
					<Check size={17} strokeWidth={2.6} class="tick" />
				{/if}
			</button>

			{#each LOCALES as option (option)}
				<button type="submit" class="option" name="locale" value={option} disabled={switching}>
					<!-- Never translated: somebody looking for German looks for "Deutsch". -->
					<span class="what"><span class="title">{LOCALE_NAMES[option]}</span></span>
					{#if chosen === option}
						<Check size={17} strokeWidth={2.6} class="tick" />
					{/if}
				</button>
			{/each}
		</RowGroup>
	</form>

	<p class="note">{m.settings.language.note}</p>
</BottomSheet>

<style>
	/* The sheet's menu row [7c]: label left, tick right, 52px tall. */
	.option {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		min-height: 52px;
		padding: 12px 16px;
		font-size: 15px;
		text-align: left;
		color: var(--ink);
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.title {
		display: block;
	}

	.detail {
		display: block;
		margin-top: 2px;
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--text-4);
	}

	.option :global(.tick) {
		flex: none;
		color: var(--sage);
	}

	.note {
		margin: 14px 2px 22px;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
