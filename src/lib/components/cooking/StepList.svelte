<!--
	The steps of the editor [E3a] (→ plan 46): cards under part headings,
	numbered straight through. Steps are not dragged; each card's ⋯ menu moves
	it (up, down, to another part) or deletes it. "Add step" adds to the last
	part; "Add part" at the end, as under the ingredients. The form owns the
	parts; this draws them and hands every change back.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { EditorPart, EditorStep } from '$lib/utils/recipe-editor';
	import AddPart from './AddPart.svelte';
	import PartName from './PartName.svelte';
	import StepCard from './StepCard.svelte';

	type Props = {
		parts: EditorPart<EditorStep>[];
		showParts: boolean;
		canAdd: boolean;
		/** What a step's two rows say: the names it links, those suggested, its timer. */
		describe: (
			step: EditorStep,
			number: number
		) => { linked: string[]; suggested: string[]; timer: string | null };
		ontext: (id: string, text: string) => void;
		onlinks: (id: string) => void;
		ontimer: (id: string) => void;
		onmove: (id: string, direction: -1 | 1) => void;
		onmovepart: (id: string) => void;
		onremove: (id: string) => void;
		onadd: () => void;
		onrename: (from: string, to: string) => void;
		onaddpart: (name: string) => void;
	};

	let {
		parts,
		showParts,
		canAdd,
		describe,
		ontext,
		onlinks,
		ontimer,
		onmove,
		onmovepart,
		onremove,
		onadd,
		onrename,
		onaddpart
	}: Props = $props();

	const m = messages();

	/** Where each part's numbering starts: straight through the parts. */
	const starts = $derived.by(() => {
		let count = 0;
		return parts.map((part) => {
			const start = count;
			count += part.rows.length;
			return start;
		});
	});
	const total = $derived(parts.reduce((sum, part) => sum + part.rows.length, 0));
</script>

{#each parts as part, partAt (part.id)}
	{#if part.name && showParts}
		<PartName name={part.name} {onrename} />
	{/if}
	{#if part.rows.length}
		<ol class="steps" start={starts[partAt] + 1}>
			{#each part.rows as step, at (step.id)}
				{@const number = starts[partAt] + at + 1}
				{@const said = describe(step, number)}
				<StepCard
					id={step.id}
					text={step.text}
					{number}
					first={number === 1}
					last={number === total}
					{showParts}
					linked={said.linked}
					suggested={said.suggested}
					timer={said.timer}
					ontext={(text) => ontext(step.id, text)}
					onlinks={() => onlinks(step.id)}
					ontimer={() => ontimer(step.id)}
					onmove={(direction) => onmove(step.id, direction)}
					onmovepart={() => onmovepart(step.id)}
					onremove={() => onremove(step.id)}
				/>
			{/each}
		</ol>
	{/if}
{/each}

{#if canAdd}
	<button type="button" class="dashed" onclick={onadd}>+ {m.cooking.form.addStep}</button>
{/if}
<AddPart onadd={onaddpart} />

<style>
	.steps {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.dashed {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 48px;
		margin-top: 12px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-card);
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--sage-deep);
	}
</style>
