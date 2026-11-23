<!--
	Cook mode [7b] [7h] — one step at a time, dark, hands-free.

	The three things that make it different from every other screen in the app:

	- **It owns the viewport.** The `(app)` layout hands this route the whole
	  window and hides the tab bar; the middle scrolls and the Prev/Next row is
	  pinned, so a long step never pushes the buttons off a phone.
	- **The step is in the URL.** `?step=` is what a notification deep-links to and
	  what a reload comes back to, so Prev and Next keep the address bar honest as
	  they go (see `cursor` below for why the traffic is one-way). Position 0 is
	  Get ready [C1] (→ plan 47), the screen before step 1; it is no step, so no
	  timer, bar or notification ever points at it.
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
	import CookGetReady from '$lib/components/cooking/CookGetReady.svelte';
	import CookStepIngredients from '$lib/components/cooking/CookStepIngredients.svelte';
	import CookStepText from '$lib/components/cooking/CookStepText.svelte';
	import CookTimerBar from '$lib/components/cooking/CookTimerBar.svelte';
	import CookTimerRing from '$lib/components/cooking/CookTimerRing.svelte';
	import IngredientsPeekSheet from '$lib/components/cooking/IngredientsPeekSheet.svelte';
	import SetTimerSheet from '$lib/components/cooking/SetTimerSheet.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import { cookTimers } from '$lib/cook-timer.svelte';
	import { keepScreenAwake } from '$lib/wake-lock';
	import {
		compactList,
		readTicks,
		showsParts,
		stepIngredientLines,
		stepTextSize,
		ticksKey
	} from '$lib/utils/cook';
	import { scaleIngredients, servingsFactor } from '$lib/utils/ingredients';
	import { readServings } from '$lib/utils/recipes';
	import { plainName } from '$lib/utils/step-highlight';
	import { renderStep } from '$lib/utils/step-links';
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
	 *
	 * It counts positions: 0 is Get ready, 1 is step 1 (→ `positionFromUrl`).
	 */
	let cursor = $state(untrack(() => positionFromUrl()));

	/**
	 * How many this is cooked for: `?serves=`, else what the recipe was written
	 * for. Null for a recipe that never said, which has no count to change
	 * (→ DECISIONS #124). Get ready's stepper moves it (→ plan 47) and writes it
	 * back to the address, so the steps, the peek sheet, the timers' labels and
	 * a reload all follow. Read off the URL once, like `cursor`.
	 */
	let count = $state(untrack(() => countFromUrl()));

	/**
	 * The step Get ready was opened from, out of the ingredients sheet: its
	 * button goes back there instead of to step 1.
	 */
	let returnTo = $state<number | null>(null);

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
		cursor = untrack(() => positionFromUrl());
		count = untrack(() => countFromUrl());
		field = count;
		returnTo = null;
	});

	/**
	 * Get ready [C1] is there when there is something to set out: a recipe
	 * without ingredients starts at step 1, as before.
	 */
	const hasReady = $derived(recipe.ingredients.length > 0);
	const first = $derived(hasReady ? 0 : 1);

	/** Clamped on read, so a housemate deleting steps mid-cook can't strand this. */
	const position = $derived(Math.min(Math.max(cursor, first), Math.max(steps.length, first)));
	const ready = $derived(position === 0);
	/** The step's index, from 0, the way the timers count it; -1 on Get ready. */
	const index = $derived(position - 1);
	const step = $derived(ready ? null : (steps[index] ?? null));
	const last = $derived(position >= steps.length);

	/**
	 * `?step=` counts from 1, the way the screen and the notification do, and 0
	 * (or none at all, which is how the recipe screen's button opens it) is Get
	 * ready. Anything unreadable lands there too; a hand-typed 99 lands on the
	 * last step (→ `position`).
	 */
	function positionFromUrl(): number {
		const human = Number(page.url.searchParams.get('step') ?? 0);
		return Number.isFinite(human) ? Math.trunc(human) : 0;
	}

	function countFromUrl(): number | null {
		if (recipe.servings === null) return null;
		return readServings(page.url.searchParams.get('serves')) ?? recipe.servings;
	}

	/**
	 * The amounts for however many people this is being cooked for (→ SPEC
	 * §4.6). Only the numbers move. Names are what the matcher works on, so the
	 * underlines and the list under the step find the same words either way —
	 * and a step's own share of an ingredient scales by the same factor as the
	 * ingredient, or the parts would stop adding up to the whole.
	 */
	const factor = $derived(servingsFactor(recipe.servings, count ?? 0));
	const ingredients = $derived(scaleIngredients(recipe.ingredients, factor));

	/** `?serves=` only when it says something the recipe does not. */
	const scaled = $derived(count !== null && count !== recipe.servings ? count : null);

	/**
	 * Back to the recipe, still cooking for the same number of people — the count
	 * travels in the URL both ways (→ SPEC §4.5), so closing cook mode at 8 and
	 * reopening it doesn't quietly drop back to the 4 the recipe was written for.
	 */
	const recipeHref = $derived(
		`/cooking/recipes/${recipe.id}${scaled === null ? '' : `?serves=${scaled}`}`
	);

	/**
	 * Get ready's stepper field, which may hold what is still being typed (an
	 * empty field, a 0); the stepper puts it right on blur. Only a count the
	 * address would accept (`readServings`) becomes the count, and every amount
	 * follows at once, the address with it.
	 */
	let field = $state(untrack(() => count));

	$effect(() => {
		const next = readServings(field);
		if (next === null || next === untrack(() => count)) return;
		untrack(() => {
			count = next;
			writeAddress();
		});
	});

	/**
	 * Underlines, the list under the step, and the amounts rewritten for
	 * tonight's count: from the step's stored links and the words they name
	 * (→ plan 43), else — a step nobody has linked, or one pinned before the
	 * links carried words — read out of the text and the number before an
	 * underlined word, as before (→ `$lib/utils/step-links`, SPEC §4.4).
	 */
	const read = $derived(
		renderStep({ text: step?.text ?? '', uses: step?.uses ?? null }, ingredients, factor)
	);
	const segments = $derived(read.segments);

	/** What the step needs, under its text [C2] (→ plan 47). */
	const lines = $derived(stepIngredientLines(read.used, ingredients));

	/** Part names only for a recipe that has two or more (→ plan 47). */
	const stepParts = $derived(showsParts(steps));
	/** Where one part ends and the next begins, on the progress bar [C1]. */
	const partStarts = $derived(
		steps.map(
			(segment, at) =>
				stepParts && at > 0 && (steps[at - 1].section ?? null) !== (segment.section ?? null)
		)
	);

	/**
	 * How long the chip's timer runs: the step's own timer, set in the form or by
	 * an import (→ plan 21), else a duration the step mentions (→ DECISIONS #14).
	 */
	const parsed = $derived(step ? (step.timer?.seconds ?? parseStepDuration(step.text)) : null);

	/**
	 * What a timer here is called unless the cook says otherwise: the step's own
	 * timer's name, else the step it was set on (→ DECISIONS #134). It used to be
	 * the step's first ingredient, which was a guess — right often enough to keep
	 * offering, wrong often enough that "Kartoffeln (festkochen)" ended up on a
	 * lock screen and a 20-minute bake got named after the butter it was greased
	 * with. A name someone gave the step's timer is better still; the step is the
	 * fallback because it is always true. On Get ready there is no step, so a
	 * timer set there (the oven, heating up) is just a timer.
	 */
	const named = $derived(step?.timer?.label ?? null);
	const label = $derived(
		named ?? (step ? m.cooking.cook.timerForStep(position) : m.cooking.cook.defaultTimer)
	);

	/**
	 * What the sheet offers instead, one tap each: the step's own ingredients by
	 * their short names — "Kartoffeln", not "Kartoffeln (festkochen)" — deduped,
	 * because two rows of one thing are one suggestion.
	 */
	const suggestions = $derived([...new Set(read.used.map((row) => plainName(row.name)))]);

	let peeking = $state(false);
	let setting = $state(false);

	/**
	 * Get ready's ticks, kept on this device for this cook (→ plan 47): Prev,
	 * Next and a reload keep them; Finish and the next day clear them
	 * (→ `readTicks`). Read after mount, because the server has no device.
	 */
	let ticks = $state<string[]>([]);
	const ticked = $derived(new Set(ticks));

	$effect(() => {
		const key = ticksKey(recipe.id);
		untrack(() => {
			try {
				ticks = readTicks(localStorage.getItem(key), Date.now());
			} catch {
				ticks = [];
			}
		});
	});

	function toggle(id: string) {
		ticks = ticked.has(id) ? ticks.filter((one) => one !== id) : [...ticks, id];
		try {
			localStorage.setItem(ticksKey(recipe.id), JSON.stringify({ at: Date.now(), ids: ticks }));
		} catch {
			// A private window: the ticks last as long as the screen does.
		}
	}

	/** The cook is over, so its ticks are too. */
	function finish() {
		try {
			localStorage.removeItem(ticksKey(recipe.id));
		} catch {
			// Nothing was kept, then.
		}
	}

	// The timers outlive this screen, so it hydrates the store rather than owning
	// a machine (→ DECISIONS #103). Same untracking rule as the app layout:
	// `sync` reads exactly what the ticker writes.
	$effect(() => {
		const timers = data.timers;
		const fetchedAt = data.timersFetchedAt;
		untrack(() => cookTimers.sync(timers, fetchedAt));
	});

	/** The ring's timer: this recipe, this step. Get ready is no step, so it has none. */
	const ring = $derived(step ? cookTimers.forStep(recipe.id, index) : null);
	/** By the step's length, one size down while its ring runs (→ `stepTextSize`). */
	const size = $derived(stepTextSize(step?.text ?? '', ring !== null));

	/** Everything else, soonest first — at most two, since the cap is three. */
	const bars = $derived(cookTimers.all.filter((timer) => timer !== ring));

	// Hands covered in flour can't tap a phone awake (→ SPEC §4.6).
	$effect(keepScreenAwake);

	/**
	 * Replace rather than push: the back button should leave cook mode, not walk
	 * you backwards through eleven steps of a lasagne.
	 */
	function goTo(next: number) {
		cursor = next;
		returnTo = null;
		writeAddress();
	}

	/** A timer's own step, counted from 0 (→ `CookTimerBar`). */
	function goToStep(stepIndex: number) {
		goTo(stepIndex + 1);
	}

	/** From the ingredients sheet: Get ready, and back to this step after. */
	function backToReady() {
		const from = position;
		peeking = false;
		goTo(0);
		returnTo = from;
	}

	/**
	 * Built off the address rather than written from scratch: a bare `?step=2`
	 * replaces the whole query string, and `?serves=8` went with it — so the
	 * next reload (a phone waking a backgrounded PWA is the common one) came
	 * back to the recipe as written. `page.url` is the address the navigation
	 * landed on, which shallow routing deliberately leaves alone, so the step
	 * and the count are both written from this screen's state every time and
	 * neither write loses the other's.
	 */
	function writeAddress() {
		const url = new URL(page.url);
		if (position === 0) url.searchParams.delete('step');
		else url.searchParams.set('step', String(position));
		if (scaled === null) url.searchParams.delete('serves');
		else url.searchParams.set('serves', String(scaled));
		replaceState(url, page.state);
	}

	/** `name` is what the sheet's field held; the chip path never passes one. */
	function startTimer(seconds: number, name = '') {
		cookTimers.start({
			seconds,
			label: name || label,
			recipeId: recipe.id,
			stepIndex: step ? index : null
		});
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
		<!-- "Lasagne · for 8" on a step [C2]: the count Get ready settled. -->
		<span class="recipe"
			>{step && count !== null ? m.cooking.cook.titleFor(recipe.name, count) : recipe.name}</span
		>
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
			<a class="round" href={recipeHref} aria-label={m.cooking.cook.close}>
				<X size={12} strokeWidth={2.4} />
			</a>
		</div>
	</header>

	{#if steps.length > 0}
		<!-- One segment per step, and a wider gap where a part ends [C1]. -->
		<ol class="progress" aria-hidden="true">
			{#each steps as segment, at (segment.id)}
				<li class:done={at <= index} class:start={partStarts[at]}></li>
			{/each}
		</ol>

		<div class="body">
			{#if step}
				<!-- The step's part beside its number [C2] (→ plans 43, 47). -->
				<p class="eyebrow">
					{m.cooking.cook.step(position, steps.length)}{#if stepParts && step.section}<span
							class="part">{m.cooking.cook.stepPart(step.section)}</span
						>{/if}
				</p>

				<CookStepText {segments} {ingredients} {size} />

				<!-- [7h] gives the ring the room under the step; the list stays, because
					 "how much goes in now?" is the question a timer does not answer. -->
				<CookStepIngredients {lines} compact={compactList(size)} />

				<div class="chips" class:compact={compactList(size)}>
					{#if !ring}
						<button type="button" class="chip" disabled={cookTimers.atCap} onclick={startParsed}>
							<TimerIcon size={20} strokeWidth={1.9} class="amber" aria-hidden="true" />
							{parsed === null
								? m.cooking.cook.startTimer
								: named
									? m.cooking.cook.startNamedTimer(named, formatDuration(parsed))
									: m.cooking.cook.startParsedTimer(formatDuration(parsed))}
						</button>
					{/if}
					<button type="button" class="chip outlined" onclick={() => (peeking = true)}>
						<BasketIcon size={19} strokeWidth={1.9} />
						{m.cooking.cook.ingredients}
					</button>
				</div>

				{#if !ring}
					{#if cookTimers.atCap}
						<p class="note">{m.cooking.cook.timerCapped(TIMERS_MAX)}</p>
					{:else if cookTimers.lastError}
						<p class="error">{cookTimers.lastError}</p>
					{/if}
				{/if}
			{:else}
				<CookGetReady
					{ingredients}
					writtenFor={recipe.servings}
					bind:serves={field}
					{ticked}
					ontoggle={toggle}
				/>
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
				{#if ready}
					<button type="button" class="next" onclick={() => goTo(returnTo ?? 1)}>
						{returnTo === null
							? m.cooking.cook.startCooking
							: m.cooking.cook.backToStep(returnTo)}<ChevronRight
							size={20}
							strokeWidth={2.2}
							aria-hidden="true"
						/>
					</button>
				{:else}
					<button
						type="button"
						class="prev"
						onclick={() => goTo(position - 1)}
						disabled={position <= first}
						aria-label={m.cooking.cook.previous}
					>
						<ChevronLeft size={24} strokeWidth={2.2} />
					</button>

					{#if last}
						<a class="next" href={recipeHref} onclick={finish}>
							{m.cooking.cook.finish}<Check size={20} strokeWidth={2.4} aria-hidden="true" />
						</a>
					{:else}
						<button type="button" class="next" onclick={() => goTo(position + 1)}>
							{m.cooking.cook.next}<ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
						</button>
					{/if}
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
		{ingredients}
		servings={count}
		used={read.used}
		onready={hasReady ? backToReady : undefined}
		onclose={() => (peeking = false)}
	/>
{/if}

{#if setting}
	<SetTimerSheet
		suggestedSeconds={parsed}
		defaultName={label}
		names={suggestions}
		onstart={startTimer}
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
		font-size: var(--fs-16);
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

	/* The first step of a part, a little apart from the one before [C1]. */
	.progress .start {
		margin-left: 8px;
	}

	/* The only part that scrolls. A six-line step, a running ring and the Next
		 button together are taller than a phone, and of the three the step is the
		 one you can afford to move. */
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 22px 24px 8px;
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
		margin: 0 0 14px;
		font-size: var(--fs-15);
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--cook-amber);
	}

	/* "· Béchamel": the part, quieter than the count it follows [C2]. */
	.eyebrow .part {
		color: var(--cook-muted);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 18px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 12px 18px;
		border: 1px solid transparent;
		border-radius: var(--r-input);
		background: var(--cook-surface);
		font-size: var(--fs-18);
		font-weight: 600;
		color: var(--cook-text);
	}

	/* Under a long step the two chips share one row, so the step, its list and
	   the chips fit one phone screen (→ plan 47). */
	.compact {
		margin-top: 14px;
	}

	.compact .chip {
		gap: 7px;
		padding: 10px 14px;
		font-size: var(--fs-16);
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

	/* Not an error — the app declining to start a fourth. In amber, because it
	   is about the timers rather than about the step. */
	.note,
	.error {
		margin: 20px 0 0;
		font-size: var(--fs-15);
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
		font-size: var(--fs-20);
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
		font-size: var(--fs-28);
		font-weight: 600;
		line-height: 1.3;
	}

	.back {
		padding: 13px 20px;
		border-radius: var(--r-input);
		background: var(--cook-surface);
		font-size: var(--fs-17);
		font-weight: 600;
		color: var(--cook-text);
	}
</style>
