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

	type Props = {
		/**
		 * The action's result. Null/undefined whenever the last action wasn't a
		 * shopping add — including `plan` with the toggle off, which returns the
		 * key with no value.
		 */
		result?: { added: number; skipped: number } | null;
	};

	let { result }: Props = $props();

	const title = $derived(
		!result
			? ''
			: result.added > 0
				? `${result.added} ${result.added === 1 ? 'ingredient' : 'ingredients'} on the shopping list`
				: 'Everything is already on the list'
	);

	const detail = $derived(
		result && result.added > 0 && result.skipped > 0
			? `${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} already on it`
			: undefined
	);
</script>

{#if result}
	<div class="banner">
		<Banner variant="info" {title} {detail} action="Open list" href="/shopping">
			{#snippet icon()}<BasketIcon size={18} strokeWidth={1.9} />{/snippet}
		</Banner>
	</div>
{/if}

<style>
	.banner {
		margin-bottom: 18px;
	}
</style>
