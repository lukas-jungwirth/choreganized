<!--
	Cook mode [7b] [7h] — one step at a time, dark, hands-free.

	The three things that make it different from every other screen in the app:

	- **It owns the viewport.** The `(app)` layout hands this route the whole
	  window and hides the tab bar; the middle scrolls and the Prev/Next row is
	  pinned, so a long step never pushes the buttons off a phone.
	- **The step is in the URL.** `?step=` is what a notification deep-links to and
	  what a reload comes back to, so Prev and Next keep the address bar honest as
	  they go (see `cursor` below for why the traffic is one-way).
	- **The timers are server rows.** Everything on screen is a rendering of them
	  (→ `$lib/cook-timer.svelte.ts`), because the alarm has to survive the phone
	  going to sleep in your pocket [7h·2]. Up to three at once (→ DECISIONS
	  #102), and they belong to the *app* rather than to this screen (→ #103):
	  the step you're on keeps the ring, the rest shrink to bars, and walking out
	  of cook mode leaves them running in the dock above the tab bar.
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
	import { cookTimers } from '$lib/cook-timer.svelte';
	import { keepScreenAwake } from '$lib/wake-lock';
	import { highlightStep } from '$lib/utils/step-highlight';
	import { messages } from '$lib/i18n';
	import { formatDuration, parseStepDuration, TIMERS_MAX } from '$lib/utils/timer-parse';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import X from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

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

	/**
	 * Which recipe `cursor` was read for. Cook mode is one component for every
	 * recipe, so following another recipe's timer bar swaps `data.recipe`
	 * underneath without a remount — and the initializer above would never run
	 * again, leaving you on step 6 of a recipe you just arrived at.
	 */
	let cursorFor = $state(untrack(() => recipe.id));

	$effect(() => {
		const id = recipe.id;
		if (untrack(() => cursorFor) === id) return;

		cursorFor = id;
		cursor = untrack(() => stepFromUrl());
	});

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

	/**
	 * "Mushrooms" — what the ring and the notification call this timer. Three
	 * timers all called "Timer" are one timer, so a step that names no
	 * ingredient falls back to saying where it was set.
	 */
	const label = $derived(read.used[0]?.name ?? m.cooking.cook.timerForStep(index + 1));

	let peeking = $state(false);
	let setting = $state(false);

	// The timers outlive this screen, so it hydrates the store rather than owning
	// a machine (→ DECISIONS #103). Same untracking rule as the app layout:
	// `sync` reads exactly what the ticker writes.
	$effect(() => {
		const timers = data.timers;
		const fetchedAt = data.timersFetchedAt;
		untrack(() => cookTimers.sync(timers, fetchedAt));
	});

	/** The ring's timer: this recipe, this step. */
	const ring = $derived(cookTimers.forStep(recipe.id, index));
	/** Everything else, soonest first — at most two, since the cap is three. */
	const bars = $derived(cookTimers.all.filter((timer) => timer !== ring));

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

	function startTimer(seconds: number) {
		cookTimers.start({ seconds, label, recipeId: recipe.id, stepIndex: index });
	}

	function startParsed() {
		if (parsed === null) {
			setting = true;
			return;
		}
		startTimer(parsed);
	}
</script>

<svelte:head>
	<title>{m.cooking.cook.title(recipe.name)}</title>
</svelte:head>

<main class="cook">
	<header>
		<span class="recipe">{recipe.name}</span>
		<div class="tools">
			<!-- Gated as well as the chip, so two timers can never land on the same
				 step — the second one's Pause and +1:00 would be unreachable. -->
			<button
				type="button"
				class="round"
				disabled={cookTimers.atCap || ring !== null}
				onclick={() => (setting = true)}
				aria-label={m.cooking.cook.setTimer}
			>
				<TimerIcon size={16} strokeWidth={2.1} />
			</button>
			<a class="round" href="/cooking/recipes/{recipe.id}" aria-label={m.cooking.cook.close}>
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
			<p class="eyebrow">{m.cooking.cook.step(index + 1, steps.length)}</p>

			<CookStepText segments={read.segments} />

			<div class="chips">
				{#if !ring}
					<button type="button" class="chip" disabled={cookTimers.atCap} onclick={startParsed}>
						<TimerIcon size={20} strokeWidth={1.9} class="amber" aria-hidden="true" />
						{parsed === null
							? m.cooking.cook.startTimer
							: m.cooking.cook.startParsedTimer(formatDuration(parsed))}
					</button>
				{/if}
				<button type="button" class="chip outlined" onclick={() => (peeking = true)}>
					<BasketIcon size={19} strokeWidth={1.9} />
					{m.cooking.cook.ingredients}
				</button>
			</div>

			<!-- [7h] clears the whole area under the step to make room for the ring.
				 This keeps the Ingredients chip — the peek is the one thing you still
				 want mid-timer — and drops the line whose contents the peek repeats. -->
			{#if read.used.length > 0 && !ring}
				<p class="uses">
					{m.cooking.cook.usesLead}<b
						>{read.used.map((row) => m.units.ingredient(row)).join(' · ')}</b
					>
				</p>
			{/if}

			{#if !ring}
				{#if cookTimers.atCap}
					<p class="note">{m.cooking.cook.timerCapped(TIMERS_MAX)}</p>
				{:else if cookTimers.lastError}
					<p class="error">{cookTimers.lastError}</p>
				{/if}
			{/if}
		</div>

		<!-- Outside the scrolling half on purpose: a countdown you have to scroll
			 to pause is not a kitchen timer. The step text gives way instead. -->
		{#if ring}
			<CookTimerRing timer={ring} />
		{/if}

		<nav class="nav">
			<!-- Keyed by the machine, not the row: the id changes on every pause and
				 every +1:00 (→ DECISIONS #15), the object counting down does not. -->
			{#each bars as timer (timer.key)}
				<CookTimerBar {timer} recipeId={recipe.id} step={index} onjump={goToStep} />
			{/each}

			<div class="buttons">
				<button
					type="button"
					class="prev"
					onclick={() => goToStep(index - 1)}
					disabled={index === 0}
					aria-label={m.cooking.cook.previous}
				>
					<ChevronLeft size={24} strokeWidth={2.2} />
				</button>

				{#if last}
					<a class="next" href="/cooking/recipes/{recipe.id}">
						{m.cooking.cook.finish}<Check size={20} strokeWidth={2.4} aria-hidden="true" />
					</a>
				{:else}
					<button type="button" class="next" onclick={() => goToStep(index + 1)}>
						{m.cooking.cook.next}<ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
					</button>
				{/if}
			</div>
		</nav>
	{:else}
		<div class="body empty">
			<p class="eyebrow">{m.cooking.cook.eyebrow}</p>
			<p class="no-steps">{m.cooking.cook.noSteps}</p>
			<a class="back" href="/cooking/recipes/{recipe.id}/edit">{m.cooking.cook.addSteps}</a>
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
	<SetTimerSheet suggestedSeconds={parsed} onstart={startTimer} onclose={() => (setting = false)} />
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

	/* Only `.prev` had a disabled state; the two timer entry points need one too,
	   because at the cap they stand down rather than disappearing. */
	.chip:disabled,
	.round:disabled {
		opacity: 0.45;
		cursor: default;
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

	/* Not an error — the app declining to start a fourth. `.uses`' treatment in
	   amber, because it is about the timers rather than about the step. */
	.note,
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
