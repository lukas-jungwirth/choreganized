<!--
	The app's icon and name at the top of a guest's page [G6] [G7] and the dead
	link [G8] (→ SPEC §11.15). The icon is the deploy's own set, so the test
	environment shows its TEST icon here as it does in the tab (→ DECISIONS
	#236); the root layout hands every page that set's folder.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { messages } from '$lib/i18n';

	const m = messages();
	const icons = $derived((page.data.icons as string | undefined) ?? '/icons');
</script>

<p class="brand">
	<img src="{icons}/icon-192.png" alt="" width="24" height="24" />{m.common.appName}
</p>

<style>
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 6px 0 22px;
		font-size: var(--fs-14);
		font-weight: 700;
		color: var(--text-3);
	}

	img {
		flex: none;
		border-radius: 7px;
	}
</style>
