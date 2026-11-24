<!--
	A folded list at the bottom of the review [R1] (→ plan 45): "Left out of
	the steps · 3 sentences", the page's sentences the import dropped (tips,
	sign-offs, variations), each with "Put back"; or the import's quiet notes
	(converted amounts, an ingredient no step uses). Folded until asked for: they
	are rarely wrong and never block a save.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	type Entry = { id: string; text: string };

	type Props = {
		title: string;
		/** "3 sentences": how much is inside, beside the title. */
		count: string;
		entries: Entry[];
		/** The button beside each entry ("Put back"); absent: the entries only say something. */
		action?: { label: string; run: (id: string) => void };
		/** Quote each entry: they are the page's own sentences. */
		quoted?: boolean;
	};

	let { title, count, entries, action, quoted = false }: Props = $props();

	const uid = $props.id();
	let open = $state(false);
</script>

<div class="fold">
	<button
		type="button"
		class="head"
		aria-expanded={open}
		aria-controls="{uid}-list"
		onclick={() => (open = !open)}
	>
		<span>{title}</span>
		<small>{count}<ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" /></small>
	</button>
	{#if open}
		<ul id="{uid}-list">
			{#each entries as entry (entry.id)}
				<li>
					<span class:quoted>{entry.text}</span>
					{#if action}
						<button type="button" class="act" onclick={() => action.run(entry.id)}>
							{action.label}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.fold {
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.fold + :global(.fold) {
		margin-top: 10px;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 12px;
		width: 100%;
		min-height: 52px;
		padding: 12px 14px;
		font-size: var(--fs-16);
		font-weight: 600;
		text-align: left;
	}

	small {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--fs-14);
		font-weight: 500;
		color: var(--text-4);
	}

	[aria-expanded='true'] small :global(svg) {
		transform: rotate(180deg);
	}

	ul {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0 14px 12px;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 10px;
		font-size: var(--fs-15);
		line-height: 1.4;
		color: var(--text-2);
	}

	li span {
		flex: 1 1 12em;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.quoted::before {
		content: open-quote;
	}

	.quoted::after {
		content: close-quote;
	}

	.act {
		min-height: 44px;
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--sage);
	}
</style>
