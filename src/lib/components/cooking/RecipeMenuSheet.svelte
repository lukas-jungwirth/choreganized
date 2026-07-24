<!--
	The recipe ••• menu [7c]: edit, duplicate, share, delete.

	Share is the same rule as the invite screen (→ DECISIONS #29): where the OS
	share sheet exists it's the obvious thing, and where it doesn't the row
	copies the recipe to the clipboard instead — a different job, so it says so.
	Either way v1 shares the recipe as plain text, not a link; nothing in this
	app is public.

	The delete confirm is raised from inside the sheet, which is the nesting
	BottomSheet's Escape handling and the ref-counted scroll lock are built for.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeDetail } from '$lib/server/services/recipes';
	import { recipeShareText } from '$lib/utils/recipes';
	import Check from '@lucide/svelte/icons/check';
	import ClipboardCopy from '@lucide/svelte/icons/clipboard-copy';
	import Copy from '@lucide/svelte/icons/copy';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Share from '@lucide/svelte/icons/share';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type Props = {
		recipe: RecipeDetail;
		onclose: () => void;
	};

	let { recipe, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let confirming = $state(false);
	let copied = $state(false);
	let submitting = $state(false);
	let copyTimer: ReturnType<typeof setTimeout>;

	/** Resolved after mount — the server can't know what this phone can do. */
	let canShare = $state(false);
	$effect(() => {
		canShare = typeof navigator.share === 'function';
	});

	$effect(() => {
		if (!open) onclose();
	});

	const text = $derived(
		recipeShareText(
			{
				name: recipe.name,
				timeMinutes: recipe.timeMinutes,
				servings: recipe.servings,
				ingredients: recipe.ingredients,
				steps: recipe.steps.map((step) => step.text)
			},
			m
		)
	);

	async function share() {
		try {
			if (canShare) {
				await navigator.share({ title: recipe.name, text });
				open = false;
				return;
			}

			await navigator.clipboard.writeText(text);
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 2000);
		} catch {
			// Cancelled, or the clipboard is blocked on an insecure origin —
			// nothing broke and nothing needs reporting.
		}
	}
</script>

<BottomSheet bind:open title={recipe.name}>
	<RowGroup surface="sunken">
		<a class="item" href="/cooking/recipes/{recipe.id}/edit">
			<Pencil size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.menu.edit}
		</a>

		<form
			method="POST"
			action="?/duplicate"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
					// The action redirects to the copy — but that's the *same* route
					// with a different `[id]`, so SvelteKit reuses the page component
					// and this sheet would still be sitting over the duplicate,
					// retargeted at it. Close it ourselves.
					open = false;
				};
			}}
		>
			<button type="submit" class="item" disabled={submitting}>
				<Copy size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.menu.duplicate}
			</button>
		</form>

		<button type="button" class="item" onclick={share}>
			{#if copied}
				<Check size={19} strokeWidth={2.2} aria-hidden="true" />{m.cooking.menu.copied}
			{:else if canShare}
				<Share size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.menu.share}
			{:else}
				<!-- Not `Copy`: "Duplicate" is right above and means something else. -->
				<ClipboardCopy size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.menu.copy}
			{/if}
		</button>
	</RowGroup>

	<div class="danger">
		<RowGroup surface="sunken">
			<button type="button" class="item destructive" onclick={() => (confirming = true)}>
				<Trash2 size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.menu.delete}
			</button>
		</RowGroup>
	</div>

	<button type="button" class="cancel" onclick={() => (open = false)}>{m.common.cancel}</button>

	<CenterModal bind:open={confirming} label={m.cooking.menu.delete} dismissible={false}>
		<div class="well" aria-hidden="true"><Trash2 size={26} strokeWidth={1.9} /></div>
		<h3>{m.cooking.menu.deleteConfirm(recipe.name)}</h3>
		<p class="copy">{m.cooking.menu.deleteCopy}</p>
		<form method="POST" action="?/delete" use:enhance>
			<Button type="submit" variant="danger">{m.cooking.menu.delete}</Button>
		</form>
		<button type="button" class="cancel" onclick={() => (confirming = false)}>
			{m.cooking.menu.keep}
		</button>
	</CenterModal>
</BottomSheet>

<style>
	/* One row shape for links, submit buttons and plain buttons alike. */
	.item {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		padding: 15px 16px;
		font-size: 15px;
		font-weight: 500;
		color: var(--text-2);
		text-align: left;
	}

	.item:active {
		background: var(--sunken-2);
	}

	.item:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.destructive {
		color: var(--danger);
	}

	.danger {
		margin-top: 14px;
	}

	.cancel {
		width: 100%;
		padding: 15px;
		margin-top: 14px;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: 15px;
		font-weight: 700;
		color: var(--text-2);
	}

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

	h3 {
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
</style>
