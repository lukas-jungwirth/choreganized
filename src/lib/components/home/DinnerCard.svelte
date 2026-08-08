<!--
	Tonight's dinner [8b]. With nothing planned the card doesn't disappear — it
	turns into the invitation to plan one (→ SPEC §2.3), which is the only
	prompt Home gives the meal plan.

	Plan 07 filled the two blanks 02 left: the thumbnail is the recipe's photo
	when it has one (still the pot well when it doesn't, and for a meal that was
	never a recipe), and the card leads to the recipe rather than to the tab.
-->
<script lang="ts">
	import RecipeImage from '$lib/components/cooking/RecipeImage.svelte';
	import ChefHatIcon from '$lib/components/icons/ChefHatIcon.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { TonightsDinner } from '$lib/server/services/home';
	import Plus from '@lucide/svelte/icons/plus';

	let { dinner }: { dinner: TonightsDinner | null } = $props();

	const m = messages();
</script>

{#if dinner}
	<Card href={dinner.recipeId ? `/cooking/recipes/${dinner.recipeId}` : '/cooking'}>
		<span class="dinner">
			<span class="thumb" class:photo={dinner.imagePath}>
				{#if dinner.imagePath}
					<RecipeImage imagePath={dinner.imagePath} stripe={5} />
				{:else}
					<ChefHatIcon size={26} strokeWidth={1.6} />
				{/if}
			</span>
			<span class="body">
				<span class="eyebrow">{m.home.dinner.eyebrow(dinner.slot)}</span>
				<span class="name">{dinner.name}</span>
				{#if dinner.cook || dinner.others > 0}
					<span class="cook">
						{#if dinner.cook}
							<Avatar name={dinner.cook.displayName} color={dinner.cook.color} size={18} />
							{m.home.dinner.cooking(dinner.cook.displayName)}
						{/if}
						{#if dinner.others > 0}
							<span class="more">{m.home.dinner.more(dinner.others)}</span>
						{/if}
					</span>
				{/if}
			</span>
		</span>
	</Card>
{:else}
	<a class="empty" href="/cooking">
		<span class="thumb dashed"><Plus size={20} strokeWidth={2} /></span>
		<span class="body">
			<span class="eyebrow">{m.home.dinner.eyebrow('dinner')}</span>
			<span class="name muted">{m.home.dinner.add}</span>
		</span>
	</a>
{/if}

<style>
	.dinner,
	.empty {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		color: inherit;
	}

	.empty {
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-card-lg);
	}

	.thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 66px;
		height: 66px;
		border-radius: 16px;
		background: var(--sunken);
		color: var(--text-disabled);
	}

	/* The photo fills the well rather than sitting in it. */
	.photo {
		overflow: hidden;
	}

	.dashed {
		background: none;
		border: 1.5px dashed var(--border-dashed);
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.eyebrow {
		display: block;
		margin-bottom: 4px;
		font-size: calc(10px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sage);
	}

	.name {
		display: block;
		font-family: var(--font-display);
		font-size: calc(18px * var(--fs));
		font-weight: 600;
		line-height: 1.15;
	}

	.muted {
		color: var(--text-4);
	}

	.cook {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 5px;
		font-size: calc(12px * var(--fs));
		color: var(--text-4);
	}

	/* The rest of today, counted rather than listed — a step quieter than the
	   cook it sits beside, because it is a pointer at the tab, not news. */
	.more {
		color: var(--text-5);
	}
</style>
