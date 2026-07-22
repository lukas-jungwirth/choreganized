<!--
	The add field pinned above the list [03] [7d].

	Type and press Enter (or the sage +) and the item is on the list, in the
	first store — the whole point of the field is that adding milk costs one
	gesture. The sliders button beside it is SPEC §3.1's "expand affordance": it
	hands what you've typed to the full sheet [3a], where quantity, unit and
	store live.

	The field keeps focus after a successful add, because things run out in
	threes.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { ITEM_NAME_MAX } from '$lib/utils/shopping';
	import Plus from '@lucide/svelte/icons/plus';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';

	type Props = {
		/**
		 * Bound, because the sheet takes this text over when you expand into it —
		 * and the page clears it once the sheet has actually added the item, so
		 * the same words can't be added twice.
		 */
		value?: string;
		onexpand: () => void;
	};

	let { value = $bindable(''), onexpand }: Props = $props();

	let input: HTMLInputElement | undefined = $state();
	/**
	 * This field's own rejection rather than `$page.form`, which belongs to
	 * whichever form posted last — the sheet's failures are not ours to show.
	 */
	let error = $state<string | undefined>();
</script>

<form
	class="quick"
	method="POST"
	action="?/add"
	use:enhance={() => {
		error = undefined;
		return async ({ result, update }) => {
			// `reset: false` and clearing by hand: a form reset doesn't notify the
			// `bind:value`, and a rejected item should stay in the field.
			await update({ reset: false });
			if (result.type === 'success') value = '';
			else if (result.type === 'failure') {
				error = typeof result.data?.error === 'string' ? result.data.error : undefined;
			}
			input?.focus();
		};
	}}
>
	<span class="lead" aria-hidden="true"><Plus size={18} strokeWidth={2} /></span>

	<input
		bind:this={input}
		bind:value
		class="input"
		type="text"
		name="name"
		placeholder="Add an item…"
		aria-label="Add an item"
		maxlength={ITEM_NAME_MAX}
		autocomplete="off"
		required
	/>

	<button type="button" class="expand" onclick={onexpand} aria-label="Add with quantity and store">
		<SlidersHorizontal size={16} strokeWidth={2} />
	</button>

	<button type="submit" class="submit" aria-label="Add item">
		<Plus size={16} strokeWidth={2.4} />
	</button>
</form>

{#if error}
	<p class="error">{error}</p>
{/if}

<style>
	.quick {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 20px;
		padding: 11px 12px 11px 16px;
		border-radius: var(--r-block);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.error {
		margin: -12px 0 16px;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.lead {
		display: flex;
		flex: none;
		color: var(--text-5);
	}

	.input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		font-size: 15px;
		color: var(--ink);
	}

	.input::placeholder {
		color: var(--text-5);
	}

	.input:focus {
		outline: none;
	}

	.expand,
	.submit {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 11px;
	}

	/* The design draws 32px squares; this grows the *target* to 40 without
	   moving anything, and stops short of the 10px gap so the two don't overlap. */
	.expand::after,
	.submit::after {
		content: '';
		position: absolute;
		inset: -4px;
	}

	.expand {
		color: var(--text-5);
	}

	.submit {
		background: var(--sage);
		color: var(--on-sage);
		transition: transform 120ms ease-out;
	}

	.submit:active {
		transform: scale(0.92);
	}

	@media (prefers-reduced-motion: reduce) {
		.submit {
			transition: none;
		}
		.submit:active {
			transform: none;
		}
	}
</style>
