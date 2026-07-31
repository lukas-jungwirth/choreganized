<!--
	What "add the ingredients to the shopping list" actually did — the only trace
	the action leaves, since the list itself is a tab away.

	Shared by the week [04] and the recipe view [7a] so the two can't drift: the
	week used to say nothing at all when every ingredient was already on the list,
	which reads exactly like the toggle having been ignored.
-->
<script lang="ts">
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import { messages } from '$lib/i18n';

	type Props = {
		/**
		 * The action's result. Null/undefined whenever the last action wasn't a
		 * shopping add — including `plan`, which now only ever *offers* the
		 * ingredients (→ `cooking/IngredientPickSheet`).
		 */
		result?: { added: number; merged: number; skipped: number } | null;
	};

	let { result }: Props = $props();

	const m = messages();

	/** New rows plus topped-up ones: what the trip actually changed. */
	const changed = $derived(result ? result.added + result.merged : 0);

	const title = $derived(
		!result
			? ''
			: changed === 0
				? m.cooking.shoppingResult.nothing
				: result.added > 0
					? m.cooking.shoppingResult.added(result.added)
					: m.cooking.shoppingResult.toppedUp(result.merged)
	);

	/**
	 * What the headline didn't say. Nothing at all when nothing changed — the
	 * title is then already "everything is on the list", and "3 were already on
	 * it" underneath is the same sentence with a number in it.
	 */
	const detail = $derived.by(() => {
		if (!result || changed === 0) return undefined;

		const parts = [
			result.added > 0 && result.merged > 0 ? m.cooking.shoppingResult.merged(result.merged) : null,
			result.skipped > 0 ? m.cooking.shoppingResult.skipped(result.skipped) : null
		].filter((part) => part !== null);

		return parts.length ? parts.join(' · ') : undefined;
	});
</script>

{#if result}
	<div class="banner">
		<Banner
			variant="info"
			{title}
			{detail}
			action={m.cooking.shoppingResult.openList}
			href="/shopping"
		>
			{#snippet icon()}<BasketIcon size={18} strokeWidth={1.9} />{/snippet}
		</Banner>
	</div>
{/if}

<style>
	.banner {
		margin-bottom: 18px;
	}
</style>
