<!--
	The names an add field offers under itself: things this household has bought
	before, best match first (→ SPEC §3.1, `lib/item-suggest.svelte.ts`).

	It floats rather than pushing the page down — a list that shoved the shopping
	list around on every keystroke would be worse than no list — so the field
	around it owns the `position: relative`.

	Buttons, not `<li>`s with click handlers: `role="option"` on a real button is
	a tap target, a pressed state and a click event that already works. They are
	out of the tab order because the field keeps focus throughout; the keyboard
	drives them through `aria-activedescendant`.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';

	type Props = {
		/** The field's `aria-controls`; each row's id is derived from it. */
		id: string;
		matches: string[];
		/** Which row the keyboard is on, or −1 for none. */
		active: number;
		onpick: (name: string) => void;
	};

	let { id, matches, active, onpick }: Props = $props();

	const m = messages();
</script>

<div class="list" {id} role="listbox" aria-label={m.shopping.suggestions.label}>
	{#each matches as name, index (name)}
		<button
			type="button"
			class="option"
			class:active={index === active}
			id="{id}-{index}"
			role="option"
			aria-selected={index === active}
			tabindex="-1"
			onpointerdown={(event) => {
				// The field must not lose focus to this press: a blur would close the
				// list out from under the tap and the click would land on nothing.
				event.preventDefault();
			}}
			onclick={() => onpick(name)}
		>
			{name}
		</button>
	{/each}
</div>

<style>
	.list {
		position: absolute;
		z-index: 5;
		top: calc(100% + 6px);
		right: 0;
		left: 0;
		overflow: hidden;
		border: 1px solid var(--border-soft);
		border-radius: var(--r-block);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.option {
		display: block;
		width: 100%;
		padding: 12px 16px;
		border-top: 1px solid var(--divider);
		font-size: calc(15px * var(--fs));
		font-weight: 500;
		color: var(--ink);
		text-align: left;
		/* A long name is one row, not two — the list stays a glance. */
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.option:first-child {
		border-top: none;
	}

	.option:active,
	.active {
		background: var(--sage-row);
	}
</style>
