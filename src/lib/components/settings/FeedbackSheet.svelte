<!--
	Send feedback [6a] (→ SPEC §6, plan 16) — a bug or an idea, in your own
	words, in whatever language you write in.

	The sheet says what travels with the report *before* it is sent, because
	saying so afterwards isn't saying so. What it doesn't promise is a round trip
	to GitHub: the report is saved the moment this returns, and the copy is made
	on the server's own time (→ DECISIONS #135), so "thanks" is true either way.

	There is no `ui/TextArea` — the app's other two are locally styled for the
	same reason (→ DESIGN-SYSTEM). This one borrows `TextField`'s field/label/
	error shape so a sheet with both in it doesn't read as two design systems.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { messages } from '$lib/i18n';
	import { FEEDBACK_BODY_MAX, type FeedbackKind } from '$lib/utils/feedback';

	type Props = {
		/** The build this report will say it came from (→ `server/version.ts`). */
		versionLabel: string;
		onclose: () => void;
	};

	let { versionLabel, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let kind = $state<FeedbackKind>('bug');
	let body = $state('');
	let submitting = $state(false);
	let error = $state<string | undefined>();

	const id = $props.id();

	const kinds = $derived([
		{ value: 'bug', label: m.settings.feedback.bug },
		{ value: 'idea', label: m.settings.feedback.idea }
	]);

	/** The prompt follows the switch: the two kinds want different questions. */
	const placeholder = $derived(
		kind === 'bug' ? m.settings.feedback.bugPlaceholder : m.settings.feedback.ideaPlaceholder
	);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.settings.feedback.title} eyebrow={m.settings.feedback.eyebrow}>
	<form
		method="POST"
		action="?/sendFeedback"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<SegmentedControl options={kinds} bind:value={kind} label={m.settings.feedback.kindLabel} />

		<!-- The control is a pair of `type="button"`s bound to `kind`; it posts
			 nothing of its own, so the value needs a field to travel in. -->
		<input type="hidden" name="kind" value={kind} />

		<div class="field">
			<label class="label" for={id}>{m.settings.feedback.label}</label>
			<textarea
				{id}
				name="body"
				bind:value={body}
				class:invalid={!!error}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				rows="6"
				{placeholder}
				maxlength={FEEDBACK_BODY_MAX}></textarea>
			{#if error}
				<p class="error" id="{id}-error">{error}</p>
			{/if}
		</div>

		<p class="note">{m.settings.feedback.attached(versionLabel)}</p>

		<Button type="submit" disabled={submitting || !body.trim()}>
			{submitting ? m.settings.feedback.sending : m.settings.feedback.send}
		</Button>
	</form>
</BottomSheet>

<style>
	.field {
		display: flex;
		flex-direction: column;
		margin-top: 18px;
	}

	.label {
		margin-bottom: 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	textarea {
		width: 100%;
		padding: 13px 16px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		/* White on the paper background; the sheet sets --input-surface to --field. */
		background: var(--input-surface, var(--card));
		font-family: inherit;
		font-size: calc(15px * var(--fs));
		line-height: 1.45;
		color: var(--ink);
		resize: none;
	}

	textarea::placeholder {
		color: var(--text-disabled);
	}

	textarea:focus {
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

	.note {
		margin: 12px 2px 22px;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
