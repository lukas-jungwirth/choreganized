<!--
	Labelled text input: uppercase micro-label + white field, sage outline on
	focus, danger outline when the action came back with an error.
-->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = HTMLInputAttributes & {
		label: string;
		value?: string;
		/** Message from a failed form action; also outlines the field. */
		error?: string;
	};

	let { label, value = $bindable(''), error, ...rest }: Props = $props();

	const id = $props.id();
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<input
		{id}
		class="input"
		class:invalid={!!error}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : undefined}
		bind:value
		{...rest}
	/>
	{#if error}
		<p class="error" id="{id}-error">{error}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
	}

	.label {
		margin-bottom: 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.input {
		width: 100%;
		padding: 15px 16px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		/* White on the paper background; sheets set --input-surface to --field. */
		background: var(--input-surface, var(--card));
		font-size: calc(15px * var(--fs));
		color: var(--ink);
	}

	.input::placeholder {
		color: var(--text-disabled);
	}

	.input:focus {
		outline: none;
		border-color: var(--sage);
	}

	.invalid {
		border-color: var(--danger-border);
	}

	.error {
		margin: 8px 0 0;
		font-size: calc(13px * var(--fs));
		color: var(--danger-deep);
	}
</style>
