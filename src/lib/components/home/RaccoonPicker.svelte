<!--
	The raccoon picker (→ plan 34, SPEC §12): admin mode only. Every pose Home
	can show (`HOME_RACCOONS`), by name, so each one can be checked where Home
	really puts it. The section raccoons aren't Home's and aren't offered.

	Picking is navigation, not state: `?raccoon=<name>` goes back to the server,
	which applies it only in admin mode (→ `home/+page.server.ts`), so what shows
	is placed exactly as the date or the hour would place it. Home loads this
	component on demand, so it is no part of anyone else's visit.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { MascotName } from '$lib/assets/mascot';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Mascot from '$lib/components/ui/Mascot.svelte';
	import { messages } from '$lib/i18n';
	import { HOME_RACCOONS } from '$lib/utils/raccoon';

	type Props = {
		/** On screen now. */
		current: MascotName;
		/** What the date and hour chose. */
		today: MascotName;
		onclose: () => void;
	};

	let { current, today, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});

	async function pick(name: MascotName | null) {
		const url = new URL(window.location.href);
		if (name && name !== today) url.searchParams.set('raccoon', name);
		else url.searchParams.delete('raccoon');
		open = false;
		await goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}
</script>

<BottomSheet bind:open title={m.home.raccoonPicker.title} eyebrow={m.admin.row}>
	{#if current !== today}
		<button type="button" class="back" onclick={() => pick(null)}>
			{m.home.raccoonPicker.backToToday}
		</button>
	{/if}

	<ul class="grid">
		{#each HOME_RACCOONS as name (name)}
			<li>
				<button
					type="button"
					class={['option', { current: name === current }]}
					aria-pressed={name === current}
					onclick={() => pick(name)}
				>
					<span class="art"><Mascot {name} height={64} /></span>
					<span class="name">{name}</span>
					{#if name === today}<span class="today">{m.home.raccoonPicker.today}</span>{/if}
				</button>
			</li>
		{/each}
	</ul>
</BottomSheet>

<style>
	.back {
		width: 100%;
		margin-bottom: 12px;
		padding: 12px;
		border-radius: var(--r-button);
		background: var(--sage-tint);
		font-size: var(--fs-15);
		font-weight: 700;
		color: var(--sage);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin: 0 0 22px;
		padding: 0;
		list-style: none;
	}

	.option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 100%;
		padding: 10px 4px;
		border: 2px solid transparent;
		border-radius: var(--r-block);
		background: var(--sunken);
	}

	.option.current {
		border-color: var(--sage);
		background: var(--sage-row);
	}

	.art {
		display: flex;
		justify-content: center;
		width: 100%;
		height: 64px;
		overflow: hidden;
	}

	.name {
		font-size: var(--fs-13);
		color: var(--text-3);
		overflow-wrap: anywhere;
		text-align: center;
	}

	.today {
		font-size: var(--fs-12);
		font-weight: 700;
		color: var(--sage);
	}
</style>
