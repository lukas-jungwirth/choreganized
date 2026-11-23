<!--
	One step of an import's review, edited on its own (→ plan 45): its text,
	and its links one tap further (plan 46's link sheet). Tapping a step in the
	review opens this; the rest of the recipe stays as it is. Mounted per
	opening, so the initialisers are the reset.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import { STEP_TEXT_MAX } from '$lib/utils/recipes';
	import Link from '@lucide/svelte/icons/link';
	import { untrack } from 'svelte';

	type Props = {
		number: number;
		text: string;
		onsave: (text: string) => void;
		/** Save the text, then open the step's link sheet. */
		onlinks: (text: string) => void;
		onremove: () => void;
		onclose: () => void;
	};

	let { number, text: given, onsave, onlinks, onremove, onclose }: Props = $props();

	const m = messages();
	const t = m.cooking.import.review;
	const uid = $props.id();

	let open = $state(true);
	let text = $state(untrack(() => given));
	/** What happens once the sheet is shut: the parent opens the next one only then. */
	let then: (() => void) | null = null;

	$effect(() => {
		if (open) return;
		// The next sheet first, while this step is still the one the parent names.
		then?.();
		onclose();
	});

	function finish(next?: () => void) {
		if (text.trim()) onsave(text);
		then = next ?? null;
		open = false;
	}
</script>

<BottomSheet bind:open eyebrow={t.stepSheet(number)} title={t.stepText}>
	<label class="sr-only" for="{uid}-text">{t.stepText}</label>
	<textarea id="{uid}-text" bind:value={text} rows="5" maxlength={STEP_TEXT_MAX}></textarea>

	<button type="button" class="links" onclick={() => finish(() => onlinks(text))}>
		<Link size={18} strokeWidth={2} aria-hidden="true" />{t.stepLinks}
	</button>

	<div class="foot">
		<Button type="button" onclick={() => finish()} disabled={!text.trim()}>{t.done}</Button>
		<button
			type="button"
			class="remove"
			onclick={() => {
				onremove();
				open = false;
			}}>{t.removeStep}</button
		>
	</div>
</BottomSheet>

<style>
	textarea {
		width: 100%;
		min-height: 140px;
		padding: 12px 14px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
		font-family: inherit;
		font-size: var(--fs-17);
		line-height: 1.5;
		color: var(--ink);
		resize: vertical;
	}

	textarea:focus {
		outline: none;
		border-color: var(--sage);
	}

	.links {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 48px;
		margin-top: 12px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--sage-deep);
	}

	.foot {
		margin-top: 18px;
	}

	.remove {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: 10px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--danger);
		text-align: center;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
