<!--
	Impressum or Datenschutz (→ SPEC §13): a plain reading page. The title is the
	app's, in the reader's language; the text in the card is the operator's,
	shown as written (→ server/legal, utils/legal-text). Then one row to the
	other page, when the deploy has it.

	No design frame: built to `design/sketches/settings-access.html`, agreed
	with Lukas on 2026-11-20. No tab bar, signed in or not: the page is outside
	`(app)`, and back is the one way on.
-->
<script lang="ts">
	import LegalText from '$lib/components/legal/LegalText.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Lock from '@lucide/svelte/icons/lock';
	import Scale from '@lucide/svelte/icons/scale';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const title = $derived(data.page === 'imprint' ? m.legal.imprint : m.legal.privacy);
</script>

<svelte:head>
	<title>{m.common.pageTitle(title)}</title>
</svelte:head>

<Screen>
	<SubHeader {title} back={data.back} />

	<Card radius="md">
		<div class="text">
			<LegalText blocks={data.blocks} lang={data.lang} />
		</div>
	</Card>

	{#if data.other}
		<div class="other">
			<RowGroup>
				<a class="row" href={data.other.href}>
					<span class="tile" aria-hidden="true">
						{#if data.other.page === 'privacy'}
							<Lock size={18} strokeWidth={1.9} />
						{:else}
							<Scale size={18} strokeWidth={1.9} />
						{/if}
					</span>
					<span class="label">
						{data.other.page === 'privacy' ? m.legal.privacy : m.legal.imprint}
					</span>
					<ChevronRight size={15} strokeWidth={2} class="chevron" />
				</a>
			</RowGroup>
		</div>
	{/if}
</Screen>

<style>
	.text {
		padding: 18px;
	}

	.other {
		margin-top: 14px;
	}

	/* The settings row [6a], as Settings → About draws the same two links. */
	.row {
		display: flex;
		align-items: center;
		gap: 13px;
		min-height: 52px;
		padding: 12px 16px;
		font-size: var(--fs-17);
		color: var(--ink);
	}

	.label {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.tile {
		display: flex;
		flex: none;
		color: var(--sage);
	}

	.row :global(.chevron) {
		flex: none;
		margin-left: -6px;
		color: var(--border-dashed);
	}
</style>
