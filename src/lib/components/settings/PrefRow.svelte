<!--
	One notification preference [6a]: a label and a switch that saves itself.

	No Save button, because a settings switch that needs confirming isn't a
	switch — the row posts on change, the way the holiday toggle does. The column
	it writes is the same `NotificationPref` a send filters on, so what you
	switch off here is exactly what stops arriving (→ ARCHITECTURE.md
	"Notifications").
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import type { NotificationPref } from '$lib/server/push';
	import { tick, untrack } from 'svelte';

	type Props = {
		pref: NotificationPref;
		label: string;
		/** What this one actually sends, for the pushes that aren't obvious. */
		detail?: string;
		checked: boolean;
	};

	let { pref, label, detail, checked }: Props = $props();

	// Optimistic while a save is in flight, the server's answer either side of
	// it: the switch is only ever ahead of the database for the length of one
	// request.
	let on = $state(untrack(() => checked));
	let saving = $state(false);
	let form: HTMLFormElement | undefined = $state();

	/**
	 * Whatever came back from the server wins. Two things reach here: the load
	 * this row's own save triggered, and the refetch-on-focus every `(app)` page
	 * runs (`lib/refetch.ts`) — so a preference changed on another device moves
	 * this switch too, instead of leaving it lying about the column.
	 */
	$effect(() => {
		const server = checked;
		if (untrack(() => saving)) return;
		on = server;
	});

	/** After `tick` the checkbox's DOM state matches `on`, so the post is right. */
	async function save() {
		await tick();
		form?.requestSubmit();
	}
</script>

<form
	method="POST"
	action="?/notify"
	bind:this={form}
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
			// A refused save (or one that changed no row) leaves the switch where
			// the database is, not where the thumb left it.
			await tick();
			on = checked;
		};
	}}
>
	<input type="hidden" name="pref" value={pref} />
	<div class="row">
		<span class="copy">
			<span class="label">{label}</span>
			{#if detail}<span class="detail">{detail}</span>{/if}
		</span>
		<Toggle name="enabled" bind:checked={on} {label} disabled={saving} onchange={save} />
	</div>
</form>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 13px;
		min-height: 52px;
		padding: 12px 16px;
	}

	.copy {
		flex: 1;
		min-width: 0;
	}

	.label {
		display: block;
		font-size: 15px;
	}

	.detail {
		display: block;
		margin-top: 2px;
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--text-4);
	}
</style>
