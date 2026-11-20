<!--
	The add field (plan 36 [L2] [L3], SPEC §3.1).

	Its leading icon is **the list it adds to**, and the placeholder names it
	("Add to Grocery…"). On the overview the icon is a button: tap it for every
	list, empty ones included, and pick another — the pick holds until the
	screen is left. A name the household knows moves the icon by itself to the
	list it went to last, and a line under the field says why; a picked list
	wins over that. On an opened list the icon is that list and nothing else.

	"Gurken x3", "Milch 2l", "3 Gurken" set the amount in the same line, at
	either end (plan 37, → `utils/lists` `parseQuickAdd`). A chip before the +
	shows what was understood while typing ("×3", "2 L"); tap it off and the
	line is added exactly as typed, and remembered as a name, so it is never
	split again. The server reads the line again with the same rules; tapping a
	row still opens the sheet [3a] to edit.

	"Other" is the menu's last entry, always, also while its card is hidden
	because nothing is on it (Lukas 2026-11-20). It wears three dots, which
	no list can pick, and picking it posts an empty list: on purpose, so a
	known name is not moved off it.

	The same name still open on the target list is not written twice: the
	typed amount goes onto that row (→ services `quickAddItem`), and a line
	under the field says so, because no new row appears to show it.

	Under the field sit the household's own words (→ `lib/item-suggest.svelte.ts`),
	each with the list it would go to. Tapping one adds it there and then — and
	a name under "{n} bought" is put back rather than added twice (→ services
	`quickAddItem`).

	The field keeps focus after a successful add, because things run out in
	threes.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ListIcon from '$lib/components/shopping/ListIcon.svelte';
	import SuggestionList from '$lib/components/shopping/SuggestionList.svelte';
	import { messages } from '$lib/i18n';
	import { itemSuggest } from '$lib/item-suggest.svelte';
	import {
		OTHER_ICON,
		OTHER_LIST_KEY,
		listTarget,
		parseQuickAdd,
		quickAddName,
		type KnownName,
		type ListKind
	} from '$lib/utils/lists';
	import { ITEM_NAME_MAX, suggestionKey } from '$lib/utils/shopping';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';

	export type QuickAddList = {
		id: string;
		name: string;
		icon: string | null;
		/** A checklist wears the terracotta well, and the icon never moves to it by itself. */
		kind: ListKind;
		/** What the menu says is on it: "4", "empty", or a checklist's "5/12". */
		status: string;
	};

	type Props = {
		/** Bound, so the page can hand it to the sheet and clear it. */
		value?: string;
		/**
		 * Everything this household has put on a list before, each with the list
		 * it went to last — what moves the icon [L3].
		 */
		known?: KnownName[];
		/** The names to complete from: `known`, minus what is already waiting. */
		offered?: string[];
		/** Every list, in order — the menu [L2]. */
		lists: QuickAddList[];
		/**
		 * "Other" as the menu's last entry, with what is on it. Left out on an
		 * opened list, where the field has no menu.
		 */
		other?: { status: string } | null;
		/** Where it adds when nothing else says otherwise: the first shopping list. */
		fallback: string | null;
		/** An opened list: the field adds to it and nothing else. */
		fixed?: { id: string; name: string; icon: string | null; kind: ListKind } | null;
		/** About to add to this list (null = "Other"), before the post goes out. */
		onadding?: (storeId: string | null) => void;
		/** It landed there. */
		onadded?: (storeId: string | null) => void;
		/** "New list" at the foot of the menu. */
		onnewlist?: () => void;
	};

	let {
		value = $bindable(''),
		known = [],
		offered = [],
		lists,
		other = null,
		fallback,
		fixed = null,
		onadding,
		onadded,
		onnewlist
	}: Props = $props();

	const m = messages();

	let form: HTMLFormElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let menuButton: HTMLButtonElement | undefined = $state();
	/**
	 * This field's own rejection rather than `$page.form`, which belongs to
	 * whichever form posted last — the sheet's failures are not ours to show.
	 */
	let error = $state<string | undefined>();

	/**
	 * A list picked from the menu (`OTHER_LIST_KEY` for "Other"). Component
	 * state, so leaving the screen resets it.
	 */
	let picked = $state<string | null>(null);

	/**
	 * "Keep here" under the remembered-list line: the field stays on the list it
	 * was on for this line, like a pick, and lets go once the field is emptied
	 * (an add empties it), so the next known name moves the icon again. Nothing
	 * is written until the add, which then remembers the kept list.
	 */
	let keep = $state(false);
	$effect(() => {
		if (!value.trim()) keep = false;
	});

	let menuOpen = $state(false);
	let menu: HTMLDivElement | undefined = $state();

	/**
	 * Before hydration the icon can't follow what is typed, so the field posts
	 * no list and the server sends a known name where it went last (→
	 * `shopping-actions`). Posting the fallback instead would file Shampoo under
	 * Grocery *and* teach the vocabulary that it belongs there.
	 */
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});

	const target = $derived(
		fixed
			? { storeId: fixed.id, remembered: null }
			: listTarget({ typed: value, known, lists, picked, fallback, keep })
	);

	/** The list "Keep here" goes back to: the one the field was on before the move. */
	const fallbackList = $derived(lists.find((list) => list.id === fallback) ?? null);

	/** "Other" drawn like a list: its name, its three dots. */
	const otherList = $derived({
		id: OTHER_LIST_KEY,
		name: m.shopping.other,
		icon: OTHER_ICON,
		kind: 'buy' as const
	});

	/** No list id with lists on screen is "Other", picked from the menu. */
	const targetList = $derived(
		fixed ??
			(target.storeId === null
				? lists.length > 0
					? otherList
					: null
				: (lists.find((list) => list.id === target.storeId) ?? null))
	);

	/**
	 * What the last add did when it wrote no new row (→ `quickAddItem`): the
	 * line under the field, until the next thing is typed or a few seconds pass.
	 */
	let note = $state<{ name: string; amount: string | null } | null>(null);
	$effect(() => {
		if (value.trim()) note = null;
	});
	$effect(() => {
		if (!note) return;
		const timer = setTimeout(() => (note = null), 6000);
		return () => clearTimeout(timer);
	});

	function noteFrom(data: Record<string, unknown> | undefined) {
		if (!data || typeof data.name !== 'string') return null;
		if (data.effect === 'already') return { name: data.name, amount: null };
		if (data.effect !== 'toppedUp' || typeof data.quantity !== 'number') return null;
		const unit = typeof data.unit === 'string' ? data.unit : null;
		return {
			name: data.name,
			amount: m.units.quantity(data.quantity, unit) || `×${data.quantity}`
		};
	}

	/** The names the household uses: a line that is one of them is never split (rule 1). */
	const knownKeys = $derived(new Set(known.map((row) => suggestionKey(row.name))));

	/** What the line would become: the chip shows its amount (plan 37). */
	const parsed = $derived(parseQuickAdd(value, knownKeys));

	/**
	 * The chip's toggle: off adds the line exactly as typed. Back on whenever the
	 * field is emptied, so one line's "no" doesn't carry over to the next.
	 */
	let amountOn = $state(true);
	$effect(() => {
		if (!value.trim()) amountOn = true;
	});

	const amount = $derived(
		parsed.quantity === null
			? null
			: m.units.quantity(parsed.quantity, parsed.unit) || `×${parsed.quantity}`
	);

	const suggest = itemSuggest(
		() => quickAddName(value, knownKeys),
		() => offered
	);
	const listId = $props.id();

	const placeholder = $derived(
		targetList ? m.shopping.quickAdd.addTo(targetList.name) : m.shopping.quickAdd.placeholder
	);

	/** The list a suggestion would land on, for the right edge of its row. */
	function detail(name: string): string | undefined {
		if (fixed) return undefined;
		const id = listTarget({ typed: name, known, lists, picked, fallback, keep }).storeId;
		if (id === null) return lists.length > 0 ? m.shopping.other : undefined;
		return lists.find((list) => list.id === id)?.name;
	}

	/**
	 * A suggestion is a finished thought, so taking one adds it — the field's
	 * promise is one gesture, and making somebody confirm their own tap would
	 * cost two.
	 *
	 * `tick()` first: the input is what the form posts, and it only carries the
	 * new text (and the list it moved the icon to) once Svelte has written them
	 * through to the DOM.
	 */
	async function add(name: string) {
		value = name;
		await tick();
		form?.requestSubmit();
	}

	function choose(id: string) {
		picked = id;
		menuOpen = false;
		input?.focus();
	}

	/** Escape or a tap outside closes the menu without choosing. */
	$effect(() => {
		if (!menuOpen) return;

		function onpointer(event: PointerEvent) {
			const target = event.target as Node | null;
			if (target && (menuButton?.parentElement?.parentElement?.contains(target) ?? false)) return;
			menuOpen = false;
		}
		function onkey(event: KeyboardEvent) {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			menuOpen = false;
			menuButton?.focus();
		}

		document.addEventListener('pointerdown', onpointer);
		document.addEventListener('keydown', onkey);
		return () => {
			document.removeEventListener('pointerdown', onpointer);
			document.removeEventListener('keydown', onkey);
		};
	});
</script>

<!-- The wrapper, not the form, carries the popovers: `position: absolute`
	 measures itself against the padding box, and the field's padding would inset
	 them from both sides — by different amounts. -->
<div class="field">
	<form
		class="quick"
		bind:this={form}
		method="POST"
		action="?/add"
		use:enhance={() => {
			error = undefined;
			note = null;
			const landed = target.storeId;
			onadding?.(landed);
			return async ({ result, update }) => {
				// `reset: false` and clearing by hand: a form reset doesn't notify the
				// `bind:value`, and a rejected item should stay in the field.
				await update({ reset: false });
				if (result.type === 'success') {
					value = '';
					note = noteFrom(result.data);
					onadded?.(landed);
				} else if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
				}
				input?.focus();
			};
		}}
	>
		<input type="hidden" name="quick" value="1" />
		{#if amount !== null && !amountOn}<input type="hidden" name="literal" value="1" />{/if}
		<!-- "" is "Other", chosen; no field at all lets the server decide. -->
		{#if hydrated || fixed}
			<input type="hidden" name="storeId" value={target.storeId ?? ''} />
		{/if}

		{#if fixed}
			<span class="well" class:check={fixed.kind === 'checklist'} aria-hidden="true"
				><ListIcon icon={fixed.icon} size={17} /></span
			>
		{:else if lists.length > 0}
			<button
				bind:this={menuButton}
				type="button"
				class="pick"
				aria-expanded={menuOpen}
				aria-controls={menuOpen ? `${listId}-menu` : undefined}
				aria-label={m.shopping.quickAdd.choose(targetList?.name ?? m.shopping.other)}
				onclick={async () => {
					menuOpen = !menuOpen;
					if (!menuOpen) return;
					// Into the menu, on the list it is on now: Tab from the icon would
					// otherwise land in the field first, which closes the menu.
					await tick();
					menu?.querySelector<HTMLButtonElement>('.mrow.on, .mrow')?.focus();
				}}
			>
				<span class="well" class:check={targetList?.kind === 'checklist'}
					><ListIcon icon={targetList?.icon} size={17} /></span
				>
				<span class="caret" class:open={menuOpen}><ChevronDown size={13} strokeWidth={2.4} /></span>
			</button>
		{:else}
			<span class="lead" aria-hidden="true"><Plus size={18} strokeWidth={2} /></span>
		{/if}

		<input
			bind:this={input}
			bind:value
			class="input"
			type="text"
			name="name"
			{placeholder}
			aria-label={placeholder}
			maxlength={ITEM_NAME_MAX}
			autocomplete="off"
			role="combobox"
			aria-expanded={suggest.open}
			aria-controls={suggest.open ? listId : undefined}
			aria-autocomplete="list"
			aria-activedescendant={suggest.active >= 0 ? `${listId}-${suggest.active}` : undefined}
			onfocus={() => {
				suggest.focused = true;
				menuOpen = false;
			}}
			onblur={() => (suggest.focused = false)}
			onkeydown={(event) => {
				const chosen = suggest.keydown(event);
				if (chosen) add(chosen);
			}}
			required
		/>

		{#if amount !== null}
			<button
				type="button"
				class="amount"
				class:off={!amountOn}
				aria-pressed={amountOn}
				aria-label={m.shopping.quickAdd.amount(amount)}
				onclick={(event) => {
					amountOn = !amountOn;
					// A tap hands the keyboard back to the line; a key press (detail 0)
					// stays on the chip, so it can be pressed again.
					if (event.detail > 0) input?.focus();
				}}
			>
				{amount}
			</button>
		{/if}
		<button type="submit" class="submit" aria-label={m.shopping.quickAdd.submit}>
			<Plus size={16} strokeWidth={2.4} />
		</button>
	</form>

	{#if menuOpen && !fixed}
		<div
			bind:this={menu}
			class="menu"
			id="{listId}-menu"
			role="group"
			aria-label={m.shopping.quickAdd.menu}
			onfocusout={(event) => {
				// Tabbing out of the menu, anywhere but back into the field, closes it.
				const next = event.relatedTarget as Node | null;
				if (!next || !menu?.parentElement?.contains(next)) menuOpen = false;
			}}
		>
			{#each lists as list (list.id)}
				{@const on = list.id === target.storeId}
				<button
					type="button"
					class="mrow"
					class:on
					aria-pressed={on}
					onclick={() => choose(list.id)}
				>
					<span class="well" class:check={list.kind === 'checklist'} aria-hidden="true"
						><ListIcon icon={list.icon} size={17} /></span
					>
					<span class="mname">{list.name}</span>
					<small>{list.status}</small>
					{#if on}<span class="tick" aria-hidden="true"><Check size={17} strokeWidth={2.6} /></span
						>{/if}
				</button>
			{/each}
			{#if other}
				{@const on = target.storeId === null}
				<button
					type="button"
					class="mrow"
					class:on
					aria-pressed={on}
					onclick={() => choose(OTHER_LIST_KEY)}
				>
					<span class="well" aria-hidden="true"><ListIcon icon={OTHER_ICON} size={17} /></span>
					<span class="mname">{m.shopping.other}</span>
					<small>{other.status}</small>
					{#if on}<span class="tick" aria-hidden="true"><Check size={17} strokeWidth={2.6} /></span
						>{/if}
				</button>
			{/if}
			{#if onnewlist}
				<button
					type="button"
					class="mrow new"
					onclick={() => {
						menuOpen = false;
						onnewlist();
					}}
				>
					<span class="well dashed" aria-hidden="true"><Plus size={16} strokeWidth={2.2} /></span>
					<span class="mname">{m.shopping.lists.newList}</span>
				</button>
			{/if}
		</div>
	{:else if suggest.open}
		<SuggestionList
			id={listId}
			matches={suggest.matches}
			active={suggest.active}
			{detail}
			onpick={(name) => add(suggest.pick(name))}
		/>
	{/if}
</div>

<!-- Always in the page, so a line appearing in it is read out (politely). -->
<div class="why-slot" aria-live="polite">
	{#if target.remembered && targetList && !fixed}
		<p class="why">
			<ListIcon icon={targetList.icon} size={14} />
			<span
				>{#each m.shopping.quickAdd.remembered(targetList.name) as part, index (index)}{#if part.strong}<strong
							>{part.text}</strong
						>{:else}{part.text}{/if}{/each}</span
			>
			{#if fallbackList}
				<button
					type="button"
					class="keep"
					aria-label={m.shopping.quickAdd.keepOn(fallbackList.name)}
					onclick={() => {
						keep = true;
						input?.focus();
					}}
				>
					{m.shopping.quickAdd.keepHere}
				</button>
			{/if}
		</p>
	{:else if note}
		<p class="why" data-testid="quick-add-note">
			<span
				>{#each note.amount === null ? m.shopping.quickAdd.already(note.name) : m.shopping.quickAdd.toppedUp(note.name, note.amount) as part, index (index)}{#if part.strong}<strong
							>{part.text}</strong
						>{:else}{part.text}{/if}{/each}</span
			>
		</p>
	{/if}
</div>

{#if error}
	<p class="error">{error}</p>
{/if}

<style>
	.field {
		position: relative;
		z-index: 3;
		margin-bottom: 16px;
	}

	.quick {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px 10px 11px;
		border-radius: var(--r-block);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.quick:focus-within {
		box-shadow:
			0 0 0 2px var(--sage),
			var(--shadow-card);
	}

	.error {
		margin: -8px 0 16px;
		font-size: var(--fs-15);
		color: var(--danger-deep);
	}

	.lead {
		display: flex;
		flex: none;
		padding-left: 5px;
		color: var(--text-5);
	}

	.well {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 11px;
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.pick {
		position: relative;
		display: flex;
		flex: none;
		align-items: center;
		gap: 2px;
		border-radius: 12px;
	}

	/* 32px drawn; the target is 44 tall without moving anything. */
	.pick::after {
		content: '';
		position: absolute;
		inset: -6px -4px;
	}

	.caret {
		display: flex;
		color: var(--text-5);
		transition: transform 160ms ease-out;
	}

	.caret.open {
		transform: rotate(180deg);
	}

	.input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		font-size: var(--fs-17);
		color: var(--ink);
	}

	.input::placeholder {
		color: var(--text-5);
	}

	.input:focus {
		outline: none;
	}

	/* What the line would be read as (plan 37): sage while it applies, struck
	   and muted once tapped off, so it can be switched back on. 32px drawn, a
	   44px target; its type stops at 18px so the field keeps one line at 200%. */
	.amount {
		position: relative;
		flex: none;
		max-width: 40%;
		min-height: 32px;
		padding: 4px 10px;
		overflow: hidden;
		border-radius: var(--r-chip);
		background: var(--sage-tint);
		font-size: min(var(--fs-14), 18px);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--sage-deep);
	}

	.amount::after {
		content: '';
		position: absolute;
		inset: -6px 0;
	}

	.amount.off {
		background: var(--sunken);
		color: var(--text-5);
		text-decoration: line-through;
	}

	.submit {
		position: relative;
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 11px;
		background: var(--sage);
		color: var(--on-sage);
		transition: transform 120ms ease-out;
	}

	.submit::after {
		content: '';
		position: absolute;
		inset: -6px;
	}

	.submit:active {
		transform: scale(0.92);
	}

	.menu {
		position: absolute;
		z-index: 5;
		top: calc(100% + 6px);
		right: 0;
		left: 0;
		overflow: hidden;
		border-radius: var(--r-block);
		background: var(--card);
		box-shadow: var(--shadow-modal);
	}

	.mrow {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 50px;
		padding: 7px 14px 7px 10px;
		font-size: var(--fs-17);
		font-weight: 500;
		color: var(--ink);
		text-align: left;
	}

	.mrow + .mrow {
		border-top: 1px solid var(--divider);
	}

	.mrow:active {
		background: var(--sage-row);
	}

	.mname {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.mrow.on .mname {
		font-weight: 700;
	}

	.mrow small {
		flex: none;
		font-size: var(--fs-14);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--text-4);
	}

	.tick {
		display: flex;
		color: var(--sage);
	}

	.mrow.new {
		color: var(--text-3);
	}

	/* A checklist's well is terracotta, as on the overview (plan 36). */
	.well.check {
		background: var(--terracotta-tint);
		color: var(--terracotta-deep);
	}

	.well.dashed {
		background: none;
		box-shadow: inset 0 0 0 1.5px var(--border-dashed);
		color: var(--text-4);
	}

	/* The sentence and "Keep here" run as one line of text, so the button
	   follows the last word and wraps like a word at large text sizes rather
	   than truncating anything. */
	.why {
		margin: -8px 6px 14px;
		font-size: var(--fs-14);
		line-height: 1.6;
		color: var(--text-4);
	}

	.why > :global(svg) {
		margin-right: 5px;
		vertical-align: -2px;
	}

	/* A text button, 44px tall by its target; the focus ring is the app's own. */
	.keep {
		position: relative;
		display: inline;
		padding: 0 4px;
		margin-left: 2px;
		border-radius: 6px;
		font-size: var(--fs-14);
		font-weight: 700;
		white-space: nowrap;
		color: var(--sage-deep);
	}

	.keep::after {
		content: '';
		position: absolute;
		inset: -13px -4px;
	}

	.why :global(strong) {
		font-weight: 600;
		color: var(--ink);
	}

	@media (prefers-reduced-motion: reduce) {
		.submit,
		.caret {
			transition: none;
		}
		.submit:active {
			transform: none;
		}
	}
</style>
