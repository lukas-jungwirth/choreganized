<!--
	What the import's gate found (→ plan 44), listed above the editor until the
	review screen of plan 45 shows the recipe as it will look with these marked
	in place. `check` items first (the count in the title is theirs), then the
	quiet `info` ones, then the sentences of the page's method no step kept.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import { parseIngredient } from '$lib/utils/ingredients';
	import type { ImportCheck } from '$lib/utils/recipes';

	type Props = {
		checks: ImportCheck[];
		/** The draft's ingredient lines, which the items name rows by. */
		lines: string[];
		leftOut?: string[];
	};

	let { checks, lines, leftOut = [] }: Props = $props();

	const m = messages();
	const t = m.cooking.import.checks;

	const ordered = $derived([
		...checks.filter((check) => check.level === 'check'),
		...checks.filter((check) => check.level === 'info')
	]);
	const count = $derived(checks.filter((check) => check.level === 'check').length);

	function nameOf(check: ImportCheck): string {
		if (check.name) return check.name;
		if (typeof check.at !== 'object' || !('ingredient' in check.at)) return '';
		const line = lines[check.at.ingredient] ?? '';
		return parseIngredient(line)?.name ?? line;
	}

	function textOf(check: ImportCheck): string {
		const name = nameOf(check);
		switch (check.kind) {
			case 'line-added':
				return t.lineAdded(check.page ?? name);
			case 'amount-differs':
				return t.amountDiffers(name, check.page ?? '');
			case 'converted':
				return t.converted(name);
			case 'name-differs':
				return t.nameDiffers(name, check.page ?? '');
			case 'new-unit':
				return t.newUnit(check.word ?? '');
			case 'choice':
				return t.choice(name, check.alternative ?? '');
			case 'reworded':
				return t.reworded(
					typeof check.at === 'object' && 'step' in check.at ? check.at.step + 1 : 0
				);
			case 'from-photo':
				return t.fromPhoto;
			case 'shares-exceed':
				return t.sharesExceed(name);
			case 'unused':
				return t.unused(name);
			case 'servings':
				return t.servings;
			case 'no-steps':
				return t.noSteps;
			case 'no-ai':
				return t.noAi;
		}
	}
</script>

{#if ordered.length || leftOut.length}
	<section class="checks" aria-label={t.label}>
		<h2>{t.title(count)}</h2>
		<ul>
			{#each ordered as check, index (index)}
				<li class:info={check.level === 'info'}>
					{textOf(check)}
					{#if check.kind === 'reworded' && check.page}
						<span class="page">{t.pageSays(check.page)}</span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if leftOut.length}
			<details>
				<summary>{t.leftOut(leftOut.length)}</summary>
				<ul>
					{#each leftOut as sentence, index (index)}
						<li class="info">{sentence}</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>
{/if}

<style>
	.checks {
		margin: 0 0 14px;
		padding: 12px 14px;
		border-radius: var(--r-input);
		background: var(--sunken);
	}

	h2 {
		margin: 0 0 6px;
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--ink);
	}

	ul {
		margin: 0;
		padding-left: 18px;
	}

	li {
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--ink);
	}

	li.info {
		color: var(--text-4);
	}

	.page {
		display: block;
		color: var(--text-4);
	}

	summary {
		margin-top: 6px;
		font-size: var(--fs-14);
		color: var(--text-4);
		cursor: pointer;
	}
</style>
