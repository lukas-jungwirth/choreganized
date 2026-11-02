<!--
	Edit your profile [6a] — the name and colour every avatar, chip and feed row
	in the household paints you with, and an optional birthday (day and month,
	no year) that only Home's raccoon reads (→ `utils/raccoon`).

	Colours are the household's scarce resource, so the picker greys out the ones
	housemates already wear (the same rule onboarding applies, SPEC §1.5) and the
	service re-checks on submit: somebody could have taken it while this sheet
	was open.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { daysInBirthdayMonth } from '$lib/utils/birthday';
	import { DISPLAY_NAME_MAX } from '$lib/utils/household';
	import { untrack } from 'svelte';

	type Props = {
		displayName: string;
		color: string;
		/** `MM-DD`, or null when not given. */
		birthday: string | null;
		/** Colours the housemates wear — everything but your own. */
		takenColors: string[];
		onclose: () => void;
	};

	let { displayName, color, birthday, takenColors, onclose }: Props = $props();

	const m = messages();

	// Seeded once and then owned by the form — a re-render from the page must
	// not overwrite what's being typed.
	let open = $state(true);
	let name = $state(untrack(() => displayName));
	let picked = $state(untrack(() => color));
	// The selects hold plain numbers as strings ("3", "14"); '' is "no birthday".
	let month = $state(untrack(() => (birthday ? String(Number(birthday.slice(0, 2))) : '')));
	let day = $state(untrack(() => (birthday ? String(Number(birthday.slice(3))) : '')));
	let submitting = $state(false);
	/** This form's own rejection, not `$page.form` (as in TaskFormSheet). */
	let error = $state<string | undefined>();
	let birthdayError = $state<string | undefined>();

	const none = { value: '', label: m.settings.profile.birthdayNone };
	const months = [
		none,
		...Array.from({ length: 12 }, (_, index) => ({
			value: String(index + 1),
			label: m.date.monthOfYear(index + 1)
		}))
	];
	// Only the days the month has; with no month yet, all 31.
	const days = $derived([
		none,
		...Array.from({ length: daysInBirthdayMonth(Number(month) || 1) }, (_, index) => ({
			value: String(index + 1),
			label: String(index + 1)
		}))
	]);

	/**
	 * 31 March → April keeps the 30th rather than offering a day that isn't
	 * there. Reads the event's value, not `month`, which the binding may not
	 * have caught up with yet.
	 */
	function clampDay(event: Event & { currentTarget: HTMLSelectElement }) {
		const max = daysInBirthdayMonth(Number(event.currentTarget.value) || 1);
		if (Number(day) > max) day = String(max);
	}

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.settings.profile.title} eyebrow={m.settings.profile.eyebrow}>
	<form
		method="POST"
		action="?/profile"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			birthdayError = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				// A taken colour keeps the sheet open with the reason on it.
				if (result.type === 'failure') {
					const reason = typeof result.data?.error === 'string' ? result.data.error : undefined;
					if (result.data?.field === 'birthday') birthdayError = reason;
					else error = reason;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<TextField
			label={m.settings.displayName}
			name="displayName"
			bind:value={name}
			{error}
			maxlength={DISPLAY_NAME_MAX}
			autocomplete="given-name"
			required
		/>

		<p class="label">{m.ui.yourColour}</p>
		<div class="colour">
			<Avatar {name} color={picked} size={52} />
			<ColorPicker bind:value={picked} taken={takenColors} />
		</div>

		<p class="label">{m.settings.birthday}</p>
		<div class="birthday">
			<Select
				label={m.settings.profile.birthdayDay}
				name="birthdayDay"
				options={days}
				bind:value={day}
			/>
			<Select
				label={m.settings.profile.birthdayMonth}
				name="birthdayMonth"
				options={months}
				bind:value={month}
				onchange={clampDay}
			/>
		</div>
		{#if birthdayError}
			<p class="note error" role="alert">{birthdayError}</p>
		{:else}
			<p class="note">{m.settings.profile.birthdayNote}</p>
		{/if}

		<Button type="submit" disabled={submitting || !name.trim()}>{m.common.saveChanges}</Button>
	</form>
</BottomSheet>

<style>
	.label {
		margin: 22px 0 12px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.colour {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	/* Day narrow, month wide: "September" needs the room, "30" doesn't. */
	.birthday {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 12px;
	}

	.note {
		margin: 8px 0 0;
		font-size: var(--fs-13);
		line-height: 1.4;
		color: var(--text-4);
	}

	.note.error {
		color: var(--danger);
	}

	form :global(.button) {
		margin-top: 26px;
	}
</style>
