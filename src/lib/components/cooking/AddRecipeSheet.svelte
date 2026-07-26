<!--
	"Add a recipe" [plan 14] — the one door the New button (and the empty state)
	opens, offering the four ways in: a link (Schema.org, no key), a photo or
	pasted text (AI, when a Gemini key is set), or the blank editor. The two AI
	rows lead to Settings when no key is set, so the feature is discoverable
	without being a dead end. Each option is a real link, so it works without JS
	and closes the sheet by simply navigating away.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { messages } from '$lib/i18n';
	import Camera from '@lucide/svelte/icons/camera';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Link from '@lucide/svelte/icons/link';
	import Pencil from '@lucide/svelte/icons/pencil';

	type Props = {
		/** Whether AI import is set up — the photo/text rows lead to Settings if not. */
		aiEnabled: boolean;
		onclose: () => void;
	};

	let { aiEnabled, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.cooking.add.title}>
	<nav class="options">
		<a class="option" href="/cooking/recipes/import">
			<span class="tile" aria-hidden="true"><Link size={19} strokeWidth={1.9} /></span>
			<span class="text">
				<span class="label">{m.cooking.add.link}</span>
				<span class="sub">{m.cooking.add.linkSub}</span>
			</span>
			<ChevronRight size={16} strokeWidth={2} class="chev" />
		</a>

		<!-- The AI ways in appear only when a key is set (→ SPEC §4.3); with none there's
			 nothing to offer, and the AI import row in Settings is where it's turned on. -->
		{#if aiEnabled}
			<a class="option" href="/cooking/recipes/import?mode=photo">
				<span class="tile" aria-hidden="true"><Camera size={19} strokeWidth={1.9} /></span>
				<span class="text">
					<span class="label">
						{m.cooking.add.photo}<span class="tag">{m.cooking.add.aiTag}</span>
					</span>
					<span class="sub">{m.cooking.add.photoSub}</span>
				</span>
				<ChevronRight size={16} strokeWidth={2} class="chev" />
			</a>

			<a class="option" href="/cooking/recipes/import?mode=text">
				<span class="tile" aria-hidden="true"><FileText size={19} strokeWidth={1.9} /></span>
				<span class="text">
					<span class="label">
						{m.cooking.add.text}<span class="tag">{m.cooking.add.aiTag}</span>
					</span>
					<span class="sub">{m.cooking.add.textSub}</span>
				</span>
				<ChevronRight size={16} strokeWidth={2} class="chev" />
			</a>
		{/if}

		<a class="option" href="/cooking/recipes/new">
			<span class="tile" aria-hidden="true"><Pencil size={19} strokeWidth={1.9} /></span>
			<span class="text">
				<span class="label">{m.cooking.add.manual}</span>
				<span class="sub">{m.cooking.add.manualSub}</span>
			</span>
			<ChevronRight size={16} strokeWidth={2} class="chev" />
		</a>
	</nav>
</BottomSheet>

<style>
	.options {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-bottom: 6px;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 13px 14px;
		border-radius: var(--r-input);
		background: var(--sunken);
		color: var(--ink);
		text-align: left;
	}

	.option:active {
		background: var(--sunken-2);
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--card);
		color: var(--sage);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 600;
	}

	.tag {
		padding: 1px 6px;
		border-radius: var(--r-chip);
		background: var(--sunken-2);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--sage);
	}

	.sub {
		font-size: 12.5px;
		color: var(--text-4);
		overflow-wrap: anywhere;
	}

	.option :global(.chev) {
		flex: none;
		color: var(--border-dashed);
	}
</style>
