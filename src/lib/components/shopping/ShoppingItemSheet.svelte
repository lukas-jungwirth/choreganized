<!--
	Add / edit item [3a]: name, quantity stepper, unit, store chips, and the CTA
	that names where it's going ("Add to Grocery list").

	The page mounts this only while it's open, so the `$state` initialisers below
	*are* the form reset — every opening starts from the item (or from what was
	typed in the quick field) rather than from whatever was left behind last time.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SuggestionList from '$lib/components/shopping/SuggestionList.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { itemSuggest } from '$lib/item-suggest.svelte';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import {
		DEFAULT_UNIT,
		ITEM_NAME_MAX,
		QUANTITY_MAX,
		UNITS,
		isUnit,
		unitLabel
	} from '$lib/utils/shopping';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';

	type Props = {
		/** The item being edited; null when adding. */
		item: ShoppingListItem | null;
		/** Prefill when adding — whatever the quick field had. */
		initialName?: string;
		/** The same pool the quick field completes from (→ SPEC §3.1). */
		suggestions?: string[];
		stores: { id: string; name: string }[];
		/** Where a new item lands unless the chips say otherwise. */
		defaultStoreId: string | null;
		/**
		 * A new item is on the list — so the quick field can drop the text this
		 * sheet took over. Not fired by "Save changes" or "Delete item", which
		 * have nothing to do with what's typed up there.
		 */
		onadded?: () => void;
		onclose: () => void;
	};

	let {
		item,
		initialName = '',
		suggestions = [],
		stores,
		defaultStoreId,
		onadded,
		onclose
	}: Props = $props();

	const m = messages();

	// Seeded once and then owned by the form — `untrack` says so out loud: a
	// re-render from the parent must not overwrite what's being typed.
	let open = $state(true);
	let name = $state(untrack(() => item?.name ?? initialName));
	// The design's stepper opens at 1 for a new item; an item that never had a
	// quantity must be editable without acquiring one, hence null.
	let quantity = $state<number | null>(untrack(() => (item ? item.quantity : 1)));
	let unit = $state(untrack(() => item?.unit ?? DEFAULT_UNIT));
	let storeId = $state(untrack(() => (item ? item.storeId : defaultStoreId)));
	let submitting = $state(false);
	/**
	 * This form's own rejection, not `$page.form`. The page-wide one belongs to
	 * whichever form posted last — reading it here would paint "Give the item a
	 * name." onto a perfectly good item just because the quick field was rejected
	 * a minute ago.
	 */
	let error = $state<string | undefined>();

	// Closing is the sheet's own business (scrim, Escape, the X) — the page just
	// hears about it and unmounts us.
	$effect(() => {
		if (!open) onclose();
	});

	/**
	 * The same completions the quick field offers, with one difference: here a
	 * pick fills the field and stops. This sheet exists to say *how much* and
	 * *which shop*, so it would be rude to submit the moment the name is right.
	 */
	const suggest = itemSuggest(
		() => name,
		() => suggestions
	);

	function take(picked: string) {
		name = suggest.pick(picked);
	}

	/** Plan 07 can put "tbsp" on an item; opening this sheet mustn't rewrite it. */
	const unitOptions = $derived(
		(unit && !isUnit(unit) ? [...UNITS, unit] : UNITS).map((value) => ({
			value,
			// A unit a recipe wrote ("tbsp") is stored canonically and shown in
			// whatever language is on; anything unrecognised shows as typed.
			label: unitLabel(value, m.units.labels)
		}))
	);

	// One id per component instance is all Svelte hands out, so the two things
	// in here that need one derive theirs from it.
	const uid = $props.id();
	const storeLabelId = `${uid}-store`;
	const listId = `${uid}-suggestions`;

	const storeName = $derived(stores.find((store) => store.id === storeId)?.name);
	const cta = $derived(
		item
			? m.common.saveChanges
			: storeName
				? m.shopping.sheet.addTo(storeName)
				: m.shopping.sheet.addToList
	);
</script>

<BottomSheet bind:open title={item ? m.shopping.sheet.edit : m.shopping.sheet.add}>
	<form
		method="POST"
		action={item ? '?/update' : '?/add'}
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				// A rejected name keeps the sheet (and the typing) on screen.
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type !== 'success') return;
				// Adding is the only path that consumed the quick field's text.
				if (!item) onadded?.();
				open = false;
			};
		}}
	>
		{#if item}<input type="hidden" name="id" value={item.id} />{/if}

		<!-- Relative, so the list floats under the field rather than shoving the
			 quantity, the store chips and the CTA down the sheet as you type. -->
		<div class="named">
			<TextField
				label={m.shopping.sheet.name}
				name="name"
				bind:value={name}
				{error}
				placeholder={m.shopping.sheet.namePlaceholder}
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
					if (picked) take(picked);
				}}
				required
			/>

			{#if suggest.open}
				<SuggestionList
					id={listId}
					matches={suggest.matches}
					active={suggest.active}
					onpick={take}
				/>
			{/if}
		</div>

		<div class="measure">
			<div class="quantity">
				<Stepper
					label={m.shopping.sheet.quantity}
					name="quantity"
					bind:value={quantity}
					max={QUANTITY_MAX}
					clearable
				/>
			</div>
			<div class="unit">
				<Select
					label={m.shopping.sheet.unit}
					name="unit"
					bind:value={unit}
					options={unitOptions}
					hint={m.shopping.sheet.unitHint}
				/>
			</div>
		</div>

		<p class="label" id={storeLabelId}>{m.shopping.sheet.store}</p>
		<div class="chips" role="group" aria-labelledby={storeLabelId}>
			{#each stores as store (store.id)}
				<Chip selected={storeId === store.id} onclick={() => (storeId = store.id)}>
					{store.name}
				</Chip>
			{/each}
			<!-- Always offered: items with no store are a real state of the list
				 (quick-added before any store existed, or a store since deleted). -->
			<Chip selected={storeId === null} onclick={() => (storeId = null)}>{m.shopping.other}</Chip>
		</div>
		<input type="hidden" name="storeId" value={storeId ?? ''} />

		<Button type="submit" disabled={submitting || !name.trim()}>{cta}</Button>

		{#if item}
			<div class="danger">
				<button
					type="submit"
					class="delete"
					formaction="?/delete"
					formnovalidate
					disabled={submitting}
				>
					<Trash2 size={19} strokeWidth={1.8} />
					<span>{m.shopping.sheet.delete}</span>
				</button>
			</div>
		{/if}
	</form>
</BottomSheet>

<style>
	.named {
		position: relative;
	}

	.measure {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin: 18px 0;
	}

	.quantity {
		flex: none;
		width: 148px;
	}

	.unit {
		flex: 1;
		min-width: 0;
	}

	.label {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 24px;
	}

	/* The destructive row [7c]: its own sunken block, well below the CTA. */
	.danger {
		margin-top: 14px;
		border-radius: var(--r-block);
		background: var(--field);
	}

	.delete {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		padding: 15px 16px;
		font-size: 15px;
		font-weight: 500;
		color: var(--danger);
	}

	.delete:disabled {
		opacity: 0.55;
	}
</style>
