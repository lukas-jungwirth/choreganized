<!--
	Two-or-three-way switch on a sunken track — "To do · 4 / History" [4a].
	Bind `value`; the options carry their own labels (counts included).
-->
<script lang="ts">
	type Option = { value: string; label: string };

	type Props = {
		options: Option[];
		value: string;
		/** Names the group for screen readers, e.g. "Task view". */
		label: string;
	};

	let { options, value = $bindable(), label }: Props = $props();
</script>

<div class="track" role="tablist" aria-label={label}>
	{#each options as option (option.value)}
		<button
			type="button"
			role="tab"
			class="segment"
			class:active={option.value === value}
			aria-selected={option.value === value}
			onclick={() => (value = option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.track {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 13px;
		background: var(--sunken-2);
	}

	.segment {
		flex: 1;
		padding: 8px 0;
		border-radius: 10px;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--text-4);
		transition: background 140ms ease-out;
	}

	.active {
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--ink);
	}

	@media (prefers-reduced-motion: reduce) {
		.segment {
			transition: none;
		}
	}
</style>
