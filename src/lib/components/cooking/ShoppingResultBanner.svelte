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
		 * shopping add — including `plan` with the toggle off, which returns the
		 * key with no value.
		 */
		result?: { added: number; skipped: number } | null;
	};

	let { result }: Props = $props();

	const m = messages();

	const title = $derived(
		!result
			? ''
			: result.added > 0
				? m.cooking.shoppingResult.added(result.added)
				: m.cooking.shoppingResult.nothing
	);

	const detail = $derived(
		result && result.added > 0 && result.skipped > 0
			? m.cooking.shoppingResult.skipped(result.skipped)
			: undefined
	);
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
