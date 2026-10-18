<!--
	AI features [6a] — owner only (→ plan 20, SPEC §6). The household's own AI
	provider keys: a main connection every AI feature uses, and an optional
	backup that answers when the main one is at its limit or down.

	One sheet, two views: the overview (what is set up, test, remove) and the
	set-up form for one slot (→ `AiConnectionForm`). Swapping the content keeps
	one focus trap and one Escape, instead of a second sheet stacked on the first.

	Keys are stored server-side and never sent back: everything here works from
	provider, model and a masked hint. The service checks the role again — this
	sheet is the affordance, not the guard.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AiConnectionForm from '$lib/components/settings/AiConnectionForm.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { AiSlot } from '$lib/ai';
	import { messages } from '$lib/i18n';
	import type { AiStatus } from '$lib/server/services/ai';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Info from '@lucide/svelte/icons/info';

	type Props = {
		status: AiStatus;
		onclose: () => void;
	};

	let { status, onclose }: Props = $props();

	const m = messages();
	const t = m.settings.ai;

	let open = $state(true);
	/** Which slot's set-up form is showing, or null for the overview. */
	let editing = $state<AiSlot | null>(null);

	/** The live test, per slot — handled in the sheet so nothing else on the page moves. */
	let testing = $state<AiSlot | null>(null);
	let tested = $state<{ slot: AiSlot; ok: boolean; message: string } | null>(null);

	$effect(() => {
		if (!open) onclose();
	});

	const title = $derived(
		editing === 'primary'
			? t.connection.titlePrimary
			: editing === 'backup'
				? t.connection.titleBackup
				: t.title
	);
</script>

<BottomSheet bind:open {title} eyebrow={t.eyebrow}>
	{#if editing}
		<button type="button" class="back" onclick={() => (editing = null)}>
			<ChevronLeft size={16} strokeWidth={2.2} />{t.back}
		</button>
		<AiConnectionForm
			slot={editing}
			current={status[editing]}
			onsaved={() => {
				editing = null;
				tested = null;
			}}
		/>
	{:else}
		<p class="lead">{t.what}</p>
		<p class="free">
			<Info size={15} strokeWidth={2.2} />
			<span>{t.freeNote}</span>
		</p>

		{#each ['primary', 'backup'] as const as slot (slot)}
			{@const connection = status[slot]}
			<section class="slot" aria-label={slot === 'primary' ? t.primary : t.backup}>
				<h3 class="slot-label">{slot === 'primary' ? t.primary : t.backup}</h3>

				{#if connection}
					<p class="what">
						<span class="name">{m.ai.providers[connection.provider].name}</span>
						<span class="model">{connection.model}</span>
						<span class="key">{t.keyHint(connection.hint)}</span>
					</p>

					<div class="actions">
						<button type="button" class="chip" onclick={() => (editing = slot)}>{t.edit}</button>

						<form
							method="POST"
							action="?/testAiConnection"
							use:enhance={() => {
								testing = slot;
								tested = null;
								return async ({ result }) => {
									testing = null;
									if (result.type === 'success') {
										tested = { slot, ok: true, message: t.test.ok };
									} else {
										const message =
											result.type === 'failure' ? result.data?.aiTestError : undefined;
										tested = {
											slot,
											ok: false,
											message: typeof message === 'string' ? message : m.ai.error.failed('')
										};
									}
								};
							}}
						>
							<input type="hidden" name="slot" value={slot} />
							<button type="submit" class="chip" disabled={testing !== null}>
								{testing === slot ? t.test.testing : t.test.label}
							</button>
						</form>

						<form
							method="POST"
							action="?/removeAiConnection"
							use:enhance={() => {
								return async ({ update }) => {
									await update({ reset: false });
									tested = null;
								};
							}}
						>
							<input type="hidden" name="slot" value={slot} />
							<button type="submit" class="chip danger">{t.remove}</button>
						</form>
					</div>

					{#if tested?.slot === slot}
						<p class="result" class:ok={tested.ok} role="status">
							{#if tested.ok}<Check size={14} strokeWidth={2.6} />{:else}<CircleAlert
									size={14}
									strokeWidth={2.4}
								/>{/if}
							{tested.message}
						</p>
					{/if}
				{:else if slot === 'primary'}
					<div class="set-up">
						<Button type="button" onclick={() => (editing = 'primary')}>{t.setUp}</Button>
					</div>
				{:else if status.primary}
					<p class="empty">{t.backupEmpty}</p>
					<button type="button" class="chip" onclick={() => (editing = 'backup')}>
						{t.addBackup}
					</button>
				{:else}
					<p class="empty">{t.backupEmpty}</p>
				{/if}
			</section>
		{/each}
	{/if}
</BottomSheet>

<style>
	.lead {
		margin: 0 2px 12px;
		font-size: calc(13.5px * var(--fs));
		line-height: 1.5;
		color: var(--text-2);
	}

	/* The free-tier caveat: worth reading before choosing, so it sits above the
	   choices — tinted like an aside rather than red like a warning. */
	.free {
		display: flex;
		gap: 9px;
		margin: 0 0 18px;
		padding: 11px 13px;
		border: 1px solid var(--info-border);
		border-radius: var(--r-input);
		background: var(--info-tint);
		font-size: calc(12.5px * var(--fs));
		line-height: 1.5;
		color: var(--text-2);
	}

	.free :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--text-3);
	}

	.slot {
		margin-bottom: 16px;
		padding: 14px 14px 12px;
		border-radius: var(--r-block);
		background: var(--sunken);
	}

	.slot-label {
		font-family: var(--font-body);
		margin: 0 0 6px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.what {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0 0 10px;
	}

	.name {
		font-size: calc(15px * var(--fs));
		font-weight: 600;
		color: var(--ink);
	}

	.model {
		font-size: calc(13px * var(--fs));
		color: var(--text-2);
		overflow-wrap: anywhere;
	}

	.key {
		font-size: calc(12px * var(--fs));
		color: var(--text-4);
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: 7px 13px;
		border-radius: var(--r-chip);
		background: var(--card);
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}

	.chip:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.chip.danger {
		color: var(--danger);
	}

	.empty {
		margin: 0 0 10px;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		color: var(--text-4);
	}

	.set-up {
		margin-top: 4px;
	}

	.result {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 10px 2px 0;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		color: var(--danger-deep);
	}

	.result :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.result.ok {
		color: var(--sage);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin: -4px 0 14px -4px;
		padding: 4px;
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}
</style>
