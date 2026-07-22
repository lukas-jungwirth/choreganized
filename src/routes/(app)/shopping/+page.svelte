<!-- Placeholder so the tab bar has somewhere to go. Plan 03 builds this screen. -->
<script lang="ts">
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
</script>

<svelte:head>
	<title>Shopping · Choreganized</title>
</svelte:head>

<PageHeader title="Shopping" />

<p class="soon">The shared list, grouped by store, moves in here next.</p>

<style>
	.soon {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}
</style>
