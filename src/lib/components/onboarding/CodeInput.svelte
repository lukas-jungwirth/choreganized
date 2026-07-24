<!--
	Six-box invite code entry [5e]. One real input sits invisibly over the boxes,
	so paste, autofill, mobile keyboards and select-all all behave natively; the
	boxes are just a rendering of its value.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import { INVITE_CODE_LENGTH, normalizeInviteCode } from '$lib/utils/invite-code';

	type Props = { value?: string; name?: string; autofocus?: boolean };

	let { value = $bindable(''), name = 'code', autofocus = false }: Props = $props();

	const m = messages();

	const boxes = $derived(
		Array.from({ length: INVITE_CODE_LENGTH }, (_, index) => value.charAt(index))
	);
	const caretAt = $derived(Math.min(value.length, INVITE_CODE_LENGTH - 1));

	let focused = $state(false);

	function onInput(event: Event & { currentTarget: HTMLInputElement }) {
		// Rewrite the input's own value too, so the caret can't drift behind
		// characters we stripped. `normalizeInviteCode` already caps the length —
		// a `maxlength` attribute would count the dash in a pasted "7K4-P2X" and
		// swallow the last character.
		value = normalizeInviteCode(event.currentTarget.value);
		event.currentTarget.value = value;
	}

	/**
	 * The text is invisible, so a click anywhere would drop the caret somewhere
	 * the boxes can't show. Codes are always typed left to right — keep it at the
	 * end, like every other one-time-code field.
	 */
	function snapCaret(event: Event & { currentTarget: HTMLInputElement }) {
		const end = event.currentTarget.value.length;
		event.currentTarget.setSelectionRange(end, end);
	}
</script>

<div class="code-input">
	<!-- svelte-ignore a11y_autofocus -- the code field is the screen's only
	     control, and typing is why you're here -->
	<input
		class="entry"
		type="text"
		{name}
		{autofocus}
		{value}
		oninput={onInput}
		onclick={snapCaret}
		onfocus={(event) => {
			focused = true;
			snapCaret(event);
		}}
		onblur={() => (focused = false)}
		inputmode="text"
		autocapitalize="characters"
		autocomplete="one-time-code"
		autocorrect="off"
		spellcheck="false"
		aria-label={m.onboarding.join.code}
	/>
	<div class="boxes" aria-hidden="true">
		{#each boxes as char, index (index)}
			<span class="box" class:active={focused && index === caretAt && !char}>
				{#if char}
					{char}
				{:else if focused && index === caretAt}
					<span class="caret"></span>
				{/if}
			</span>
		{/each}
	</div>
</div>

<style>
	.code-input {
		position: relative;
	}

	.entry {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: none;
		color: transparent;
		caret-color: transparent;
		/* Keeps iOS from zooming on focus while staying invisible. */
		font-size: 16px;
		text-align: center;
		z-index: 1;
	}

	.entry:focus {
		outline: none;
	}

	.entry::selection {
		background: transparent;
	}

	.boxes {
		display: flex;
		justify-content: center;
		gap: 9px;
	}

	.box {
		display: grid;
		place-items: center;
		width: 44px;
		height: 56px;
		border: 1.5px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
	}

	.box.active {
		border-color: var(--sage);
	}

	.caret {
		width: 2px;
		height: 24px;
		border-radius: 1px;
		background: var(--sage);
		animation: blink 1.1s steps(2, start) infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.caret {
			animation: none;
		}
	}
</style>
