<!--
	One step in the editor [E3a] (→ plan 46): its number, its text at reading
	size, and under it **two rows that say what they hold**, each at least 48px
	high: Ingredients (the linked names, or "Link the words that name them") and
	Timer (its name and time, or "Add a timer"). Tapping the text edits the
	text; tapping a row opens its sheet. A ⋯ button holds Move up, Move down,
	Move to part… (only when the recipe has parts) and Delete.

	Lukas's words for what this replaces: "not that easy to understand what to
	add, like timer, ingredients, move, delete". Every control is labelled.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import { STEP_TEXT_MAX } from '$lib/utils/recipes';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type Props = {
		/** The step's key in the form: the form finds its field by it to focus it. */
		id: string;
		text: string;
		number: number;
		first: boolean;
		last: boolean;
		showParts: boolean;
		/** The names the step links, and the ones only suggested so far. */
		linked: string[];
		suggested: string[];
		/** "Nudeln · 10:00", or null for no timer of its own. */
		timer: string | null;
		ontext: (text: string) => void;
		onlinks: () => void;
		ontimer: () => void;
		onmove: (direction: -1 | 1) => void;
		onmovepart: () => void;
		onremove: () => void;
	};

	let {
		id,
		text,
		number,
		first,
		last,
		showParts,
		linked,
		suggested,
		timer,
		ontext,
		onlinks,
		ontimer,
		onmove,
		onmovepart,
		onremove
	}: Props = $props();

	const m = messages();
	const t = m.cooking.form;
	const uid = $props.id();

	let menu = $state(false);
	let root: HTMLElement | undefined = $state();

	/** The textarea grows with its step instead of scrolling inside two lines. */
	function autogrow(node: HTMLTextAreaElement) {
		const resize = () => {
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight}px`;
		};
		resize();
		node.addEventListener('input', resize);
		return { destroy: () => node.removeEventListener('input', resize) };
	}

	function act(action: () => void) {
		menu = false;
		action();
	}
</script>

<svelte:window
	onclick={(event) => {
		if (menu && root && !root.contains(event.target as Node)) menu = false;
	}}
	onkeydown={(event) => {
		if (menu && event.key === 'Escape') menu = false;
	}}
/>

<li class="card" data-step={id} bind:this={root}>
	<div class="top">
		<span class="number" aria-hidden="true">{number}</span>
		<textarea
			id="{uid}-text"
			value={text}
			oninput={(event) => ontext(event.currentTarget.value)}
			use:autogrow
			rows="1"
			placeholder={t.stepPlaceholder}
			aria-label={t.stepLabel(number)}
			maxlength={STEP_TEXT_MAX}></textarea>
		<button
			type="button"
			class="more"
			aria-label={t.stepMenu.label(number)}
			aria-haspopup="menu"
			aria-expanded={menu}
			onclick={() => (menu = !menu)}
		>
			<Ellipsis size={20} strokeWidth={2.2} aria-hidden="true" />
		</button>
		{#if menu}
			<div class="menu" role="menu" aria-label={t.stepMenu.label(number)}>
				{#if !first}
					<button type="button" role="menuitem" onclick={() => act(() => onmove(-1))}>
						<ArrowUp size={17} strokeWidth={2} aria-hidden="true" />{t.stepMenu.up}
					</button>
				{/if}
				{#if !last}
					<button type="button" role="menuitem" onclick={() => act(() => onmove(1))}>
						<ArrowDown size={17} strokeWidth={2} aria-hidden="true" />{t.stepMenu.down}
					</button>
				{/if}
				{#if showParts}
					<button type="button" role="menuitem" onclick={() => act(onmovepart)}>
						<ArrowLeftRight size={17} strokeWidth={2} aria-hidden="true" />{t.stepMenu.toPart}
					</button>
				{/if}
				<button type="button" role="menuitem" class="delete" onclick={() => act(onremove)}>
					<Trash2 size={17} strokeWidth={2} aria-hidden="true" />{t.stepMenu.remove}
				</button>
			</div>
		{/if}
	</div>

	<button
		type="button"
		class="row"
		aria-label={t.stepRow.ingredientsLabel(number)}
		aria-describedby="{uid}-uses"
		onclick={onlinks}
	>
		<span class="key">{t.stepRow.ingredients}</span>
		{#if linked.length || suggested.length}
			<span class="value" id="{uid}-uses">
				{linked.join(', ')}{#if linked.length && suggested.length},
				{/if}{#each suggested as name, at (name)}<span
						class="suggested"
						title={t.stepRow.suggested(name)}>{name}</span
					>{#if at < suggested.length - 1},
					{/if}{/each}
			</span>
		{:else}
			<span class="value none" id="{uid}-uses">{t.stepRow.ingredientsNone}</span>
		{/if}
		<ChevronRight size={16} strokeWidth={2} class="go" aria-hidden="true" />
	</button>

	<button
		type="button"
		class="row"
		aria-label={t.stepRow.timerLabel(number)}
		aria-describedby="{uid}-timer"
		onclick={ontimer}
	>
		<span class="key">{t.stepRow.timer}</span>
		{#if timer}
			<span class="value" id="{uid}-timer">{timer}</span>
		{:else}
			<span class="value none" id="{uid}-timer">{t.stepRow.timerAdd}</span>
		{/if}
		<ChevronRight size={16} strokeWidth={2} class="go" aria-hidden="true" />
	</button>
</li>

<style>
	.card {
		position: relative;
		margin-top: 10px;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.top {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 6px 6px 14px;
	}

	.number {
		display: grid;
		place-items: center;
		flex: none;
		width: 26px;
		height: 26px;
		margin-top: 9px;
		border-radius: 50%;
		background: var(--sunken);
		font-size: min(var(--fs-14), 18px);
		font-weight: 700;
		color: var(--text-2);
	}

	textarea {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 8px 4px;
		border: none;
		border-radius: 10px;
		background: none;
		font-size: var(--fs-17);
		line-height: 1.45;
		color: var(--ink);
		resize: none;
	}

	textarea:focus {
		outline: 1.5px solid var(--sage);
	}

	textarea::placeholder {
		color: var(--text-disabled);
	}

	.more {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		color: var(--text-4);
	}

	.more[aria-expanded='true'] {
		background: var(--sunken);
	}

	.menu {
		position: absolute;
		top: 52px;
		right: 8px;
		z-index: 5;
		width: min(240px, calc(100% - 16px));
		overflow: hidden;
		border-radius: 16px;
		background: var(--card);
		box-shadow: var(--shadow-modal);
	}

	.menu button {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		min-height: 48px;
		padding: 6px 14px;
		border-top: 1px solid var(--divider);
		font-size: var(--fs-16);
		font-weight: 500;
		text-align: left;
		color: var(--ink);
	}

	.menu button:first-child {
		border-top: 0;
	}

	.menu .delete {
		color: var(--danger);
	}

	/* The two rows: label left, what it holds right, a chevron. */
	.row {
		display: grid;
		grid-template-columns: minmax(5.5em, auto) minmax(0, 1fr) 16px;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 48px;
		padding: 8px 14px;
		border-top: 1px solid var(--divider);
		font-size: var(--fs-16);
		text-align: left;
	}

	.key {
		font-weight: 600;
		color: var(--text-2);
	}

	.value {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	.value.none {
		font-weight: 600;
		color: var(--sage-deep);
	}

	/* A suggested link, not made yet: the link sheet's dotted underline. */
	.suggested {
		text-decoration: underline dotted var(--gold);
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}

	.row :global(.go) {
		color: var(--text-5);
	}
</style>
