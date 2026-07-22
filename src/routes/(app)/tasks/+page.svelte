<!-- Placeholder so the tab bar has somewhere to go. Plan 04 builds this screen. -->
<script lang="ts">
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
</script>

<svelte:head>
	<title>Tasks · Choreganized</title>
</svelte:head>

<PageHeader title="Tasks" />

<p class="soon">Chores, points and the to-do list move in here next.</p>

<style>
	.soon {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}
</style>
