<!-- Placeholder so the tab bar has somewhere to go. Plan 07 builds this screen. -->
<script lang="ts">
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
</script>

<svelte:head>
	<title>Cooking · Choreganized</title>
</svelte:head>

<PageHeader title="This week" />

<p class="soon">The week's meal plan and the recipe library move in here next.</p>

<style>
	.soon {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}
</style>
