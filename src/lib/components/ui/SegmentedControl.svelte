<!--
	Two-or-three-way switch on a sunken track — "To do · 4 / History" [4a].

	Two modes, because the design uses the shape for two different things. Give
	the options an `href` and the control becomes navigation: real links, real
	`aria-current`, works without JavaScript, and `value` just says which page
	you're on. Without one it's a local switch you `bind:value` to.
-->
<script lang="ts">
	type Option = {
		value: string;
		label: string;
		/** Set on every option to make the control navigate rather than switch. */
		href?: string;
	};

	type Props = {
		options: Option[];
		value: string;
		/** Names the group for screen readers, e.g. "Task view". */
		label: string;
	};

	let { options, value = $bindable(), label }: Props = $props();

	const navigational = $derived(options.some((option) => option.href));
</script>

{#snippet segments()}
	{#each options as option (option.value)}
		{@const active = option.value === value}
		{#if option.href}
			<a class="segment" class:active href={option.href} aria-current={active ? 'page' : undefined}>
				{option.label}
			</a>
		{:else}
			<button
				type="button"
				role={navigational ? undefined : 'tab'}
				class="segment"
				class:active
				aria-selected={navigational ? undefined : active}
				onclick={() => (value = option.value)}
			>
				{option.label}
			</button>
		{/if}
	{/each}
{/snippet}

{#if navigational}
	<nav class="track" aria-label={label}>{@render segments()}</nav>
{:else}
	<div class="track" role="tablist" aria-label={label}>{@render segments()}</div>
{/if}

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
		text-align: center;
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
