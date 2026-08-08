<!--
	One row of a "pick one of these" sheet [7c] — the shape Language and
	Appearance both use (→ SPEC §6, §10).

	A submit button rather than a radio: the value travels on the button, so a
	row *is* the choice instead of something you select and then confirm. The
	caller owns the `<form>` and the field name; this owns the row.

	Extracted because the two sheets had a byte-for-byte copy of it each, which
	is two places to change the 52px row the next time [7c] moves.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	type Props = {
		/** The form field this row answers — `name`/`value` on the button. */
		name: string;
		value: string;
		label: string;
		/** The second line, where an option needs one ("Follow this device — …"). */
		detail?: string;
		selected: boolean;
		disabled?: boolean;
	};

	let { name, value, label, detail, selected, disabled = false }: Props = $props();
</script>

<button type="submit" class="option" {name} {value} {disabled}>
	<span class="what">
		<span class="title">{label}</span>
		{#if detail}<span class="detail">{detail}</span>{/if}
	</span>
	{#if selected}
		<Check size={17} strokeWidth={2.6} class="tick" />
	{/if}
</button>

<style>
	/* The sheet's menu row [7c]: label left, tick right, 52px tall. */
	.option {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		min-height: 52px;
		padding: 12px 16px;
		font-size: calc(15px * var(--fs));
		text-align: left;
		color: var(--ink);
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.title {
		display: block;
	}

	.detail {
		display: block;
		margin-top: 2px;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.4;
		color: var(--text-4);
	}

	.option :global(.tick) {
		flex: none;
		color: var(--sage);
	}
</style>
