<!--
	The add field pinned above the list [03] [7d].

	Type and press Enter (or the sage +) and the item is on the list, in the
	first store — the whole point of the field is that adding milk costs one
	gesture. The sliders button beside it is SPEC §3.1's "expand affordance": it
	hands what you've typed to the full sheet [3a], where quantity, unit and
	store live.

	Under the field sit the household's own words: type "Rind" and
	"Rinderhackfleisch", bought some week last winter, is one tap away
	(→ `lib/item-suggest.svelte.ts`). Tapping one adds it there and then — the
	same one gesture, with the typing done for you.

	The field keeps focus after a successful add, because things run out in
	threes.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SuggestionList from '$lib/components/shopping/SuggestionList.svelte';
	import { messages } from '$lib/i18n';
	import { itemSuggest } from '$lib/item-suggest.svelte';
	import { ITEM_NAME_MAX } from '$lib/utils/shopping';
	import Plus from '@lucide/svelte/icons/plus';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import { tick } from 'svelte';

	type Props = {
		/**
		 * Bound, because the sheet takes this text over when you expand into it —
		 * and the page clears it once the sheet has actually added the item, so
		 * the same words can't be added twice.
		 */
		value?: string;
		/** Everything this household has put on the list before, most recent first. */
		suggestions?: string[];
		onexpand: () => void;
	};

	let { value = $bindable(''), suggestions = [], onexpand }: Props = $props();

	const m = messages();

	let form: HTMLFormElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	/**
	 * This field's own rejection rather than `$page.form`, which belongs to
	 * whichever form posted last — the sheet's failures are not ours to show.
	 */
	let error = $state<string | undefined>();

	const suggest = itemSuggest(
		() => value,
		() => suggestions
	);
	const listId = $props.id();

	/**
	 * A suggestion is a finished thought, so taking one adds it — the field's
	 * promise is one gesture, and making somebody confirm their own tap would
	 * cost two.
	 *
	 * `tick()` first: the input is what the form posts, and it only carries the
	 * new text once Svelte has written the binding through to the DOM.
	 */
	async function add(name: string) {
		value = name;
		await tick();
		form?.requestSubmit();
	}
</script>

<!-- The wrapper, not the form, carries the list: `position: absolute` measures
	 itself against the padding box, and the field's padding would inset the
	 list from both sides — by different amounts. -->
<div class="field">
	<form
		class="quick"
		bind:this={form}
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
			placeholder={m.shopping.quickAdd.placeholder}
			aria-label={m.shopping.quickAdd.label}
			maxlength={ITEM_NAME_MAX}
			autocomplete="off"
			role="combobox"
			aria-expanded={suggest.open}
			aria-controls={suggest.open ? listId : undefined}
			aria-autocomplete="list"
			aria-activedescendant={suggest.active >= 0 ? `${listId}-${suggest.active}` : undefined}
			onfocus={() => (suggest.focused = true)}
			onblur={() => (suggest.focused = false)}
			onkeydown={(event) => {
				const picked = suggest.keydown(event);
				if (picked) add(picked);
			}}
			required
		/>

		<button type="button" class="expand" onclick={onexpand} aria-label={m.shopping.quickAdd.expand}>
			<SlidersHorizontal size={16} strokeWidth={2} />
		</button>

		<button type="submit" class="submit" aria-label={m.shopping.quickAdd.submit}>
			<Plus size={16} strokeWidth={2.4} />
		</button>
	</form>

	{#if suggest.open}
		<SuggestionList
			id={listId}
			matches={suggest.matches}
			active={suggest.active}
			onpick={(name) => add(suggest.pick(name))}
		/>
	{/if}
</div>

{#if error}
	<p class="error">{error}</p>
{/if}

<style>
	.field {
		position: relative;
		margin-bottom: 20px;
	}

	.quick {
		display: flex;
		align-items: center;
		gap: 10px;
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
