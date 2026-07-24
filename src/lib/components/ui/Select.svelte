<!--
	Dropdown in the shape of TextField: uppercase micro-label, sunken field,
	chevron, optional hint underneath ("pcs · g · kg · ml · L …" in [3a]).

	A real <select> under the styling — it submits inside a form action, opens
	the platform's own picker on a phone, and keyboards for free. The chevron is
	decoration painted on top, which is why it can't take a pointer event.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	type Option = { value: string; label: string };

	type Props = HTMLSelectAttributes & {
		label: string;
		options: Option[];
		value?: string;
		/** Quiet line under the field — the full set when only one value shows. */
		hint?: string;
	};

	// `class` is destructured out rather than left in `rest`: spreading it would
	// replace the base class instead of adding to it, silently stripping the
	// field's background, radius and chevron room (Chip and Button do the same).
	let {
		label,
		options,
		value = $bindable(''),
		hint,
		class: className = '',
		...rest
	}: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<div class="shell">
		<select
			{id}
			aria-describedby={hint ? hintId : undefined}
			{...rest}
			class="select {className}"
			bind:value
		>
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		<span class="chevron" aria-hidden="true">
			<ChevronDown size={12} strokeWidth={2.4} />
		</span>
	</div>
	{#if hint}<p class="hint" id={hintId}>{hint}</p>{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.label {
		margin-bottom: 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.shell {
		position: relative;
		display: flex;
	}

	.select {
		appearance: none;
		width: 100%;
		padding: 14px 36px 14px 14px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--input-surface, var(--card));
		font-family: inherit;
		font-size: 15px;
		font-weight: 500;
		color: var(--ink);
	}

	.select:focus {
		outline: none;
		border-color: var(--sage);
	}

	.chevron {
		position: absolute;
		top: 50%;
		right: 14px;
		display: flex;
		transform: translateY(-50%);
		color: var(--text-4);
		pointer-events: none;
	}

	.hint {
		margin: 6px 0 0 2px;
		font-size: 11px;
		color: var(--text-disabled);
	}
</style>
