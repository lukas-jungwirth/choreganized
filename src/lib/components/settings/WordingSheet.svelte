<!--
	Recipe wording [6a] (→ plan 24, SPEC §6) — owner only. How imported German
	recipes are worded: as the site wrote them, or in Austrian German (Obers,
	Topfen, Erdäpfel), from a fixed list (→ `$lib/utils/wording`).

	The Theme sheet's shape: one form, a submit button per row, so a row *is* the
	choice. The service checks the role again — this is the affordance.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SheetOption from '$lib/components/settings/SheetOption.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeWording } from '$lib/utils/wording';

	type Props = {
		chosen: RecipeWording | null;
		onclose: () => void;
	};

	let { chosen, onclose }: Props = $props();

	const m = messages();
	const t = m.settings.wording;

	let open = $state(true);
	let switching = $state(false);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={t.title} eyebrow={m.settings.household}>
	<form
		method="POST"
		action="?/recipeWording"
		use:enhance={() => {
			switching = true;
			return async ({ update }) => {
				await update();
				switching = false;
				open = false;
			};
		}}
	>
		<RowGroup surface="sunken">
			<SheetOption
				name="wording"
				value=""
				label={t.asWritten}
				detail={t.asWrittenDetail}
				selected={chosen === null}
				disabled={switching}
			/>
			<SheetOption
				name="wording"
				value="austrian"
				label={t.austrian}
				detail={t.austrianDetail}
				selected={chosen === 'austrian'}
				disabled={switching}
			/>
		</RowGroup>
	</form>

	<p class="note">{t.note}</p>
</BottomSheet>

<style>
	.note {
		margin: 14px 2px 22px;
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
