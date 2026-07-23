<!--
	Cook mode [7b] [7h] — one step at a time, dark, hands-free.

	The three things that make it different from every other screen in the app:

	- **It owns the viewport.** The `(app)` layout hands this route the whole
	  window and hides the tab bar; the middle scrolls and the Prev/Next row is
	  pinned, so a long step never pushes the buttons off a phone.
	- **The step is in the URL.** `?step=` is what a notification deep-links to and
	  what a reload comes back to, so Prev and Next keep the address bar honest as
	  they go (see `cursor` below for why the traffic is one-way).
	- **The timer is a server row.** Everything on screen is a rendering of it
	  (→ `$lib/cook-timer.svelte.ts`), because the alarm has to survive the phone
	  going to sleep in your pocket [7h·2].
-->
<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import CookStepText from '$lib/components/cooking/CookStepText.svelte';
	import CookTimerBar from '$lib/components/cooking/CookTimerBar.svelte';
	import CookTimerRing from '$lib/components/cooking/CookTimerRing.svelte';
	import IngredientsPeekSheet from '$lib/components/cooking/IngredientsPeekSheet.svelte';
	import SetTimerSheet from '$lib/components/cooking/SetTimerSheet.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import { CookTimer } from '$lib/cook-timer.svelte';
	import { keepScreenAwake } from '$lib/wake-lock';
	import { highlightStep } from '$lib/utils/step-highlight';
	import { formatIngredient } from '$lib/utils/ingredients';
	import { formatDuration, parseStepDuration } from '$lib/utils/timer-parse';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import X from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const recipe = $derived(data.recipe);
	const steps = $derived(recipe.steps);

	/**
	 * Where you are, and where the URL says you are — which are the same thing
	 * pointed at from two directions.
	 *
	 * The URL is read *once*, at mount, and written on every Prev/Next. It can't
	 * be the source of truth the other way round: `replaceState` is shallow
	 * routing, which updates `page.state` and the address bar but deliberately
	 * not `page.url`, and a real `goto` per step would put a network round trip
	 * between a wet hand and the next instruction. Nothing is lost — a deep link
	 * from a notification arrives as a fresh document (the service worker's
	 * `client.navigate`), so it comes in through the initializer below.
	 */
	let cursor = $state(untrack(() => stepFromUrl()));

	/** Clamped on read, so a housemate deleting steps mid-cook can't strand this. */
	const index = $derived(Math.min(Math.max(cursor, 0), Math.max(steps.length - 1, 0)));
	const step = $derived(steps[index] ?? null);
	const last = $derived(index >= steps.length - 1);

	/**
	 * `?step=` counts from 1, the way the screen and the notification do; the
	 * index behind it counts from 0. Anything unreadable — a hand-typed 99, a
	 * link into a recipe that has since lost steps — lands on the first step
	 * rather than on nothing.
	 */
	function stepFromUrl(): number {
		const human = Number(page.url.searchParams.get('step'));
		return Number.isFinite(human) ? Math.trunc(human) - 1 : 0;
	}

	/** Underlines, and the list under the step — both read out of the text. */
	const read = $derived(highlightStep(step?.text ?? '', recipe.ingredients));

	/** A duration the step mentions, if it mentions one (→ DECISIONS #14). */
	const parsed = $derived(step ? parseStepDuration(step.text) : null);

	/** "Mushrooms" — what the ring and the notification call this timer. */
	const label = $derived(read.used[0]?.name ?? '');

	// Seeded once from the load — the timer already running when this screen
	// opened, which is the normal case when a notification is what opened it.
	// After that the machine owns itself; a refetch must not restart it.
	let timer = $state.raw(untrack(() => new CookTimer(recipe.id, data.timer)));
	let peeking = $state(false);
	let setting = $state(false);

	// Cook mode is one component for every recipe, so the id under it can in
	// principle change without a remount. The machine has to go with it.
	$effect(() => {
		const recipeId = recipe.id;
		if (untrack(() => timer.recipeId) !== recipeId) timer = new CookTimer(recipeId, null);
	});

	// Stops the tick when the screen goes; the row on the server keeps its alarm.
	$effect(() => {
		const machine = timer;
		return () => machine.dispose();
	});

	// Hands covered in flour can't tap a phone awake (→ SPEC §4.6).
	$effect(keepScreenAwake);

	/**
	 * Replace rather than push: the back button should leave cook mode, not walk
	 * you backwards through eleven steps of a lasagne.
	 */
	function goToStep(next: number) {
		cursor = next;
		replaceState(`?step=${index + 1}`, {});
	}

	function startParsed() {
		if (parsed === null) {
			setting = true;
			return;
		}
		timer.start(parsed, label, index);
	}
</script>

<svelte:head>
	<title>Cook · {recipe.name}</title>
</svelte:head>

<main class="cook">
	<header>
		<span class="recipe">{recipe.name}</span>
		<div class="tools">
			<button type="button" class="round" onclick={() => (setting = true)} aria-label="Set a timer">
				<TimerIcon size={16} strokeWidth={2.1} />
			</button>
			<a class="round" href="/cooking/recipes/{recipe.id}" aria-label="Close cook mode">
				<X size={12} strokeWidth={2.4} />
			</a>
		</div>
	</header>

	{#if step}
		<ol class="progress" aria-hidden="true">
			{#each steps as segment, position (segment.id)}
				<li class:done={position <= index}></li>
			{/each}
		</ol>

		<div class="body">
			<p class="eyebrow">Step {index + 1} of {steps.length}</p>

			<CookStepText segments={read.segments} />

			<div class="chips">
				{#if !timer.isOn(index)}
					<button type="button" class="chip" onclick={startParsed}>
						<TimerIcon size={20} strokeWidth={1.9} class="amber" aria-hidden="true" />
						{parsed === null ? 'Set timer' : `Start ${formatDuration(parsed)} timer`}
					</button>
				{/if}
				<button type="button" class="chip outlined" onclick={() => (peeking = true)}>
					<BasketIcon size={19} strokeWidth={1.9} />
					Ingredients
				</button>
			</div>

			<!-- [7h] clears the whole area under the step to make room for the ring.
				 This keeps the Ingredients chip — the peek is the one thing you still
				 want mid-timer — and drops the line whose contents the peek repeats. -->
			{#if read.used.length > 0 && !timer.isOn(index)}
				<p class="uses">
					This step uses <b>{read.used.map(formatIngredient).join(' · ')}</b>
				</p>
			{/if}

			{#if !timer.isOn(index) && timer.error}
				<p class="error">{timer.error}</p>
			{/if}
		</div>

		<!-- Outside the scrolling half on purpose: a countdown you have to scroll
			 to pause is not a kitchen timer. The step text gives way instead. -->
		{#if timer.isOn(index)}
			<CookTimerRing {timer} />
		{/if}

		<nav class="nav">
			<CookTimerBar {timer} step={index} onjump={goToStep} />

			<div class="buttons">
				<button
					type="button"
					class="prev"
					onclick={() => goToStep(index - 1)}
					disabled={index === 0}
					aria-label="Previous step"
				>
					<ChevronLeft size={24} strokeWidth={2.2} />
				</button>

				{#if last}
					<a class="next" href="/cooking/recipes/{recipe.id}">
						Finish<Check size={20} strokeWidth={2.4} aria-hidden="true" />
					</a>
				{:else}
					<button type="button" class="next" onclick={() => goToStep(index + 1)}>
						Next step<ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
					</button>
				{/if}
			</div>
		</nav>
	{:else}
		<div class="body empty">
			<p class="eyebrow">Cook mode</p>
			<p class="no-steps">
				This recipe has no steps written down yet — add them and cook mode can walk you through it.
			</p>
			<a class="back" href="/cooking/recipes/{recipe.id}/edit">Add the steps</a>
		</div>
	{/if}
</main>

{#if peeking}
	<IngredientsPeekSheet
		ingredients={recipe.ingredients}
		servings={recipe.servings}
		used={read.used}
		onclose={() => (peeking = false)}
	/>
{/if}

{#if setting}
	<SetTimerSheet
		suggestedSeconds={parsed}
		onstart={(seconds) => timer.start(seconds, label, index)}
		onclose={() => (setting = false)}
	/>
{/if}

<style>
	.cook {
		display: flex;
		flex-direction: column;
		/* `100dvh` and not `100vh`: mobile Safari's toolbar would otherwise hide
			 the Next button behind itself. */
		height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		padding: calc(14px + env(safe-area-inset-top)) 0 calc(40px + env(safe-area-inset-bottom));
		background: var(--cook-bg);
		color: var(--cook-text);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 24px;
	}

	.recipe {
		min-width: 0;
		font-size: 14px;
		color: var(--cook-muted);
		overflow-wrap: anywhere;
	}

	.tools {
		display: flex;
		flex: none;
		gap: 8px;
	}

	.round {
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

	/* One segment per step, sage for everything up to and including this one. */
	.progress {
		display: flex;
		gap: 6px;
		margin: 0;
		padding: 16px 24px 0;
		list-style: none;
	}

	.progress li {
		flex: 1;
		height: 4px;
		border-radius: 2px;
		background: var(--cook-track);
	}

	.progress .done {
		background: var(--sage);
	}

	/* The only part that scrolls. A six-line step, a running ring and the Next
		 button together are taller than a phone, and of the three the step is the
		 one you can afford to move. */
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 30px 30px 8px;
		/* A five-line step at 33px is taller than what's left once a ring is
			 running, so the bottom edge fades instead of slicing a chip in half —
			 and the scrollbar goes, because this screen is read from a metre away.
			 With nothing to scroll the fade sits over empty padding and shows. */
		scrollbar-width: none;
		/* A luminance mask, not a paint colour — `black`/`transparent` are its
			 opaque/clear channels, so no design token applies (cf. the mask keywords
			 the design system leaves ungoverned). */
		-webkit-mask-image: linear-gradient(to bottom, black calc(100% - 26px), transparent);
		mask-image: linear-gradient(to bottom, black calc(100% - 26px), transparent);
	}

	.body::-webkit-scrollbar {
		display: none;
	}

	.eyebrow {
		margin: 0 0 20px;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--cook-amber);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 28px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 12px 18px;
		border: 1px solid transparent;
		border-radius: var(--r-input);
		background: var(--cook-surface);
		font-size: 16px;
		font-weight: 600;
		color: var(--cook-text);
	}

	.chip :global(svg) {
		color: var(--cook-amber);
	}

	.outlined {
		border-color: var(--cook-amber-line);
	}

	.uses {
		margin: 14px 0 0;
		padding-left: 2px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--cook-faint);
	}

	.uses b {
		font-weight: 600;
		color: var(--cook-text-2);
	}

	.error {
		margin: 20px 0 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--cook-amber);
	}

	.nav {
		flex: none;
		padding: 12px 24px 0;
	}

	.buttons {
		display: flex;
		gap: 12px;
	}

	.prev {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 64px;
		height: 64px;
		border-radius: 18px;
		background: var(--cook-surface);
		color: var(--cook-text);
	}

	.prev:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.next {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		flex: 1;
		height: 64px;
		border-radius: 18px;
		background: var(--sage);
		font-size: 17px;
		font-weight: 700;
		color: var(--on-sage);
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		max-width: 320px;
	}

	.no-steps {
		margin: 0 0 28px;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
		line-height: 1.3;
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
