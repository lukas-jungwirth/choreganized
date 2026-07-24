<!--
	The rounded search field the recipe library and the plan-a-meal sheet both
	open with [3d] [7e]. Same surface rule as TextField: white on the paper
	background, sunken inside a white sheet (→ `--input-surface`).

	A `type="search"` input, so phones offer a "search" key and the browser's own
	clear affordance exists — plus our own ×, because WebKit's is invisible on a
	tinted field and Firefox has none at all.
-->
<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import { messages } from '$lib/i18n';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = HTMLInputAttributes & {
		/** Announced name; the field shows only its placeholder, as in the design. */
		label: string;
		value?: string;
	};

	let { label, value = $bindable(''), placeholder, ...rest }: Props = $props();

	const m = messages();

	let input: HTMLInputElement | undefined = $state();
</script>

<div class="search">
	<Search size={16} strokeWidth={2} aria-hidden="true" />
	<input
		bind:this={input}
		bind:value
		type="search"
		aria-label={label}
		placeholder={placeholder ?? m.ui.search}
		autocomplete="off"
		{...rest}
	/>
	{#if value}
		<button
			type="button"
			class="clear"
			aria-label={m.ui.clearSearch}
			onclick={() => {
				if (!input) return;
				// Clear the *field* and let its own `input` event do the rest.
				// Assigning the bound `value` instead would update the field but fire
				// no event, so a parent listening on `oninput` — the library page
				// debounces its search off exactly that — would never hear the clear;
				// and dispatching one by hand afterwards races Svelte's pending DOM
				// write, whose binding then reads the *old* text straight back in.
				input.value = '';
				input.focus();
				input.dispatchEvent(new Event('input', { bubbles: true }));
			}}
		>
			<X size={13} strokeWidth={2.4} />
		</button>
	{/if}
</div>

<style>
	.search {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 11px 14px;
		border-radius: 13px;
		background: var(--input-surface, var(--card));
		color: var(--text-5);
	}

	.search:focus-within {
		outline: 1.5px solid var(--sage);
	}

	input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font-size: 14px;
		font-weight: 500;
		color: var(--ink);
	}

	input:focus {
		outline: none;
	}

	input::placeholder {
		font-weight: 400;
		color: var(--text-5);
	}

	/* WebKit draws its own dark × on top of ours. */
	input::-webkit-search-cancel-button {
		display: none;
	}

	.clear {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--sunken-2);
		color: var(--text-4);
	}
</style>
