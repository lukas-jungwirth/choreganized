<!--
	Leave household [6d] — one confirm with three things to say, because leaving
	means something different depending on who you are (→ SPEC §7):

	- **blocked** — the owner, with housemates. Somebody has to be able to manage
		members, so this one doesn't offer a way out; it points at "Make owner".
	- **last** — the only member. There is nothing left to belong to the
		household, so leaving deletes it, and the copy says so plainly rather than
		promising that "your points stay with the household".
	- **leave** — everyone else, with the design's own words.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import LogOut from '@lucide/svelte/icons/log-out';

	type Props = {
		householdName: string;
		mode: 'leave' | 'last' | 'blocked';
		onclose: () => void;
	};

	let { householdName, mode, onclose }: Props = $props();

	let open = $state(true);
	let submitting = $state(false);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});
</script>

<CenterModal bind:open label="Leave household" dismissible={false}>
	<div class="well" class:calm={mode === 'blocked'} aria-hidden="true">
		{#if mode === 'blocked'}
			<CrownIcon size={30} />
		{:else}
			<LogOut size={28} strokeWidth={1.9} />
		{/if}
	</div>

	{#if mode === 'blocked'}
		<h2>Hand over the house first</h2>
		<p class="copy">
			You're the owner of {householdName}, and someone has to be able to manage members and the
			invite. Make a housemate the owner, then you can leave.
		</p>
		<Button href="/settings/members" variant="secondary">Go to members</Button>
	{:else}
		<h2>Leave {householdName}?</h2>
		<p class="copy">
			{#if mode === 'last'}
				You're the only one here, so leaving deletes {householdName} for good — the shopping list, the
				meal plan, every task and all the points logged so far. This can't be undone.
			{:else}
				You'll lose access to the shared shopping list, tasks and meal plan. Your points stay with
				the household.
			{/if}
		</p>

		{#if error}<p class="error">{error}</p>{/if}

		<form
			method="POST"
			action="?/leave"
			use:enhance={() => {
				submitting = true;
				error = undefined;
				return async ({ result, update }) => {
					// A success is a redirect to onboarding — `update` follows it.
					await update();
					submitting = false;
					if (result.type === 'failure') {
						error =
							typeof result.data?.error === 'string'
								? result.data.error
								: "That didn't work. Try again.";
					}
				};
			}}
		>
			<!-- What this confirm promised. The service only deletes a household
				 when the screen said it would (→ DECISIONS #64). -->
			<input type="hidden" name="mode" value={mode} />
			<Button type="submit" variant="danger" disabled={submitting}>
				{mode === 'last' ? 'Delete household & leave' : 'Leave household'}
			</Button>
		</form>
	{/if}

	<button type="button" class="cancel" onclick={() => (open = false)}>Cancel</button>
</CenterModal>

<style>
	.well {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 60px;
		margin: 0 auto 18px;
		border-radius: 50%;
		background: var(--danger-tint);
		color: var(--danger);
	}

	/* Nothing is being destroyed in the blocked case — it's an instruction. */
	.well.calm {
		background: var(--sage-tint);
		color: var(--sage);
	}

	h2 {
		margin-bottom: 10px;
		font-size: 22px;
		overflow-wrap: anywhere;
	}

	.copy {
		margin: 0 0 24px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.error {
		margin: -14px 0 20px;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.cancel {
		width: 100%;
		padding: 13px;
		font-size: 15px;
		font-weight: 700;
		color: var(--text-2);
	}
</style>
