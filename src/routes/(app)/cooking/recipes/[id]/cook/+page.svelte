<!--
	Cook mode [7b] [7h] — plan 08's screen. Standing in for it: the dark surface,
	the recipe it would be cooking, and the way back.

	The `(app)` layout already gives this route the viewport to itself and hides
	the tab bar (it's the one route that opts out), so what's here is what plan 08
	replaces — not a half-built version of it.
-->
<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const steps = $derived(data.recipe.steps.length);
</script>

<svelte:head>
	<title>Cook · {data.recipe.name}</title>
</svelte:head>

<main class="cook">
	<header>
		<span class="recipe">{data.recipe.name}</span>
		<a class="close" href="/cooking/recipes/{data.recipe.id}" aria-label="Close cook mode">
			<X size={12} strokeWidth={2.4} />
		</a>
	</header>

	<div class="middle">
		<p class="eyebrow">Cook mode</p>
		<h1>Nearly ready</h1>
		<p class="copy">
			{steps === 1 ? 'The one step' : `All ${steps} steps`} of this recipe, one at a time, with timers
			that go off even when the phone is locked — that's next.
		</p>
		<a class="back" href="/cooking/recipes/{data.recipe.id}">Back to the recipe</a>
	</div>
</main>

<style>
	.cook {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		padding: calc(14px + env(safe-area-inset-top)) 24px calc(40px + env(safe-area-inset-bottom));
		background: var(--cook-bg);
		color: var(--cook-text);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.recipe {
		font-size: 14px;
		color: var(--cook-muted);
		overflow-wrap: anywhere;
	}

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--cook-surface);
		color: var(--cook-text);
	}

	.middle {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		flex: 1;
		max-width: 320px;
	}

	.eyebrow {
		margin: 0 0 14px;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--cook-amber);
	}

	h1 {
		margin-bottom: 16px;
		font-size: 33px;
		line-height: 1.22;
	}

	.copy {
		margin: 0 0 28px;
		font-size: 15px;
		line-height: 1.55;
		color: var(--cook-muted);
	}

	.back {
		padding: 13px 20px;
		border-radius: var(--r-input);
		background: var(--cook-surface);
		font-size: 15px;
		font-weight: 600;
		color: var(--cook-text);
	}
</style>
