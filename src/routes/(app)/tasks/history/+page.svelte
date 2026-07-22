<!--
	Placeholder so Home's "All →" and the standings strip lead somewhere real.
	Plan 09 builds the podium and the completed feed [8a].
-->
<script lang="ts">
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
</script>

<svelte:head>
	<title>History · Choreganized</title>
</svelte:head>

<PageHeader title="History" />

<p class="soon">The month's standings and everything you've both ticked off move in here next.</p>

<style>
	.soon {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}
</style>
