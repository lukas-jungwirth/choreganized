<!--
	The ingredients of the editor [E1] (→ plan 46): rows under part headings.

	- A row shows what is stored: the name, the amount and unit on the right,
	  the note in a smaller second line. Tapping it opens the ingredient sheet.
	- The grip drags a row (`svelte-dnd-action`, one zone per part sharing one
	  type, so a row can be dragged into another part). The arrows of DECISIONS
	  #67 are gone.
	- The add field at the foot of each part reads a whole line the way you'd
	  write it ("400 g Nudeln", "1 Karotte, in Scheiben"): plan 42's reader with
	  the household's own words, and plan 44's note split (`ruleRow`).
	- A recipe without parts never shows the word: no heading, only "Add part"
	  at the end. A part's name is edited in place; emptied, the part joins the
	  one above.

	It holds no state of its own beyond what is being typed: the form owns the
	parts and every change goes back through a callback.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { EditorIngredient, EditorPart } from '$lib/utils/recipe-editor';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import { dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import AddPart from './AddPart.svelte';
	import PartName from './PartName.svelte';

	type Props = {
		parts: EditorPart<EditorIngredient>[];
		/** Whether the recipe has parts anywhere, ingredients or steps. */
		showParts: boolean;
		/** Whether another row may be added (the recipe's cap). */
		canAdd: boolean;
		/** A part's rows after a drag moved them (also into it from another part). */
		onrows: (partId: string, rows: EditorIngredient[]) => void;
		/** A line typed into a part's add field. */
		onaddline: (partId: string, line: string) => void;
		onedit: (rowId: string) => void;
		onrename: (from: string, to: string) => void;
		onaddpart: (name: string) => void;
	};

	let { parts, showParts, canAdd, onrows, onaddline, onedit, onrename, onaddpart }: Props =
		$props();

	const m = messages();
	const t = m.cooking.form;

	/** Each part's add field, by part id: what is typed, not yet added. */
	let lines = $state<Record<string, string>>({});

	/** A part with no rows and no name has nothing to show, unless it is all there is. */
	const shown = $derived(
		parts.filter((part, at) => part.name !== null || part.rows.length > 0 || parts.length === 1)
	);

	function consider(partId: string, event: CustomEvent<DndEvent<EditorIngredient>>) {
		onrows(partId, event.detail.items);
	}

	function addLine(partId: string, event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (event.key !== 'Enter') return;
		// Enter in a single-line field would submit the whole recipe.
		event.preventDefault();
		const line = (lines[partId] ?? '').trim();
		if (!line || !canAdd) return;
		onaddline(partId, line);
		lines[partId] = '';
	}
</script>

{#each shown as part, partAt (part.id)}
	{#if part.name && showParts}
		<PartName name={part.name} {onrename} />
	{/if}
	<div class="card">
		<ul
			class="rows"
			aria-label={part.name ?? t.ingredients}
			use:dragHandleZone={{
				items: part.rows,
				type: 'ingredients',
				flipDurationMs: 0,
				dropTargetStyle: {},
				zoneItemTabIndex: -1
			}}
			onconsider={(event) => consider(part.id, event)}
			onfinalize={(event) => consider(part.id, event)}
		>
			{#each part.rows as row (row.id)}
				{@const amount = m.units.amount(row.quantity, row.unit)}
				<li class="row">
					<button
						type="button"
						class="grip"
						use:dragHandle
						aria-label={t.reorder(row.name || t.ingredientSheet.eyebrow)}
					>
						<GripVertical size={18} strokeWidth={2} aria-hidden="true" />
					</button>
					<button
						type="button"
						class="open"
						aria-label={t.ingredientRow([amount, row.name, row.note].filter(Boolean).join(' '))}
						onclick={() => onedit(row.id)}
					>
						<span class="name">{row.name}</span>
						{#if amount}<span class="amount">{amount}</span>{/if}
						{#if row.note}<span class="note">{row.note}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
		{#if canAdd}
			<label class="add">
				<span class="plus" aria-hidden="true"><Plus size={14} strokeWidth={2.6} /></span>
				<input
					type="text"
					bind:value={lines[part.id]}
					placeholder={partAt === 0 ? t.addLineExample : t.addLine}
					aria-label={part.name ? t.addLineTo(part.name) : t.addLine}
					enterkeyhint="done"
					autocomplete="off"
					onkeydown={(event) => addLine(part.id, event)}
				/>
			</label>
		{/if}
	</div>
{/each}

<AddPart onadd={onaddpart} />

<style>
	.card {
		overflow: hidden;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.card + .card {
		margin-top: 12px;
	}

	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: stretch;
		border-top: 1px solid var(--divider);
	}

	.row:first-child {
		border-top: 0;
	}

	.grip {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		min-height: 48px;
		color: var(--text-5);
		touch-action: none;
	}

	.open {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: 2px 12px;
		flex: 1;
		min-width: 0;
		min-height: 48px;
		padding: 12px 14px 12px 0;
		font-size: var(--fs-17);
		text-align: left;
		color: var(--ink);
	}

	.name {
		min-width: 0;
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.amount {
		font-variant-numeric: tabular-nums;
		color: var(--text-2);
		text-align: right;
	}

	.note {
		grid-column: 1 / -1;
		font-size: var(--fs-15);
		line-height: 1.35;
		color: var(--text-4);
	}

	.add {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 0 14px;
		border-top: 1px solid var(--divider);
	}

	.rows:empty + .add {
		border-top: 0;
	}

	.plus {
		display: grid;
		place-items: center;
		flex: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.add input {
		flex: 1;
		min-width: 0;
		min-height: 46px;
		border: none;
		background: none;
		font-size: var(--fs-17);
		color: var(--ink);
	}

	.add input:focus {
		outline: none;
	}

	.add:focus-within {
		box-shadow: inset 0 0 0 1.5px var(--sage);
	}

	.add input::placeholder {
		color: var(--text-disabled);
	}
</style>
