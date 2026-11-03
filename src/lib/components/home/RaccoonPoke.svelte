<!--
	Home's raccoon, pokeable (→ SPEC §2, DECISIONS #223). A small game for
	whoever finds it:

	- every tap squashes it, a little wobble from its seat on the card;
	- the third is a hit — it shakes and flushes red for a moment;
	- the fourth and fifth it stays a little red, clearly annoyed;
	- the sixth it has had enough: it ducks behind the card and stays away for
	  a few seconds, then the same raccoon comes back up, calm again.

	It never swaps the pose: which raccoon you get is the date's and the hour's
	(`utils/raccoon`), something to discover by coming back, not to pick.
	Leave it alone for a few seconds and it calms down: the count starts over.
	In admin mode Home passes `onpick`, and a tap opens the raccoon picker
	instead (→ plan 34).
	With reduced motion it doesn't move at all: the tint still shows, and the
	hiding is a fade.
-->
<script lang="ts">
	import type { MascotName } from '$lib/assets/mascot';
	import Mascot from '$lib/components/ui/Mascot.svelte';
	import { messages } from '$lib/i18n';

	type Props = {
		name: MascotName;
		height: number;
		class?: string;
		/** Admin mode: a tap opens the picker rather than poking (→ plan 34). */
		onpick?: () => void;
	};

	let { name, height, class: className, onpick }: Props = $props();

	const m = messages();

	/** The hit, the annoyance after it, and the poke that sends it away. */
	const HIT = 3;
	const GONE = 6;
	/** How long it stays cross once you stop poking. */
	const CALM_DOWN = 3000;
	/** How long it stays away once it has had enough. */
	const AWAY = 4000;

	/*
	 * Red without a colour: the art keeps its own palette, like the member
	 * colours (→ DESIGN-SYSTEM "Light & dark"), so the tint shifts it rather
	 * than painting over it — and reads the same in both themes.
	 */
	const FLUSHED = 'sepia(0.7) saturate(4) hue-rotate(-40deg) brightness(0.95)';
	const ANNOYED = 'sepia(0.2) saturate(1.5) hue-rotate(-20deg)';

	let taps = $state(0);
	let busy = $state(false);
	/** Gone behind the card: hidden for real, not just at the end of an animation. */
	let away = $state(false);
	let button: HTMLButtonElement;
	let calm: ReturnType<typeof setTimeout> | undefined;

	const annoyed = $derived(taps >= HIT);
	const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function play(keyframes: Keyframe[], duration: number, easing = 'ease-out') {
		return button.animate(keyframes, { duration, easing }).finished;
	}

	async function poke() {
		if (busy) return;
		clearTimeout(calm);
		taps += 1;
		const still = reducedMotion();

		if (taps >= GONE) {
			busy = true;
			// Down behind the card it sits on, fading as it goes so the gap under
			// a short card never shows it.
			await play(
				still
					? [{ opacity: 1 }, { opacity: 0 }]
					: [
							{ transform: 'none', opacity: 1 },
							{ transform: 'translateY(70%)', opacity: 0 }
						],
				still ? 160 : 240,
				'ease-in'
			);
			away = true;
			taps = 0;
			await new Promise((resolve) => setTimeout(resolve, AWAY));
			away = false;
			await play(
				still
					? [{ opacity: 0 }, { opacity: 1 }]
					: [
							{ transform: 'translateY(70%)', opacity: 0 },
							{ transform: 'translateY(-6%)', opacity: 1, offset: 0.7 },
							{ transform: 'none', opacity: 1 }
						],
				still ? 160 : 360
			);
			busy = false;
			return;
		}

		calm = setTimeout(() => (taps = 0), CALM_DOWN);

		if (taps === HIT) {
			const flush = [{ filter: 'none' }, { filter: FLUSHED, offset: 0.25 }, { filter: ANNOYED }];
			const shake = [
				{ transform: 'none' },
				{ transform: 'translateX(-7px) rotate(-3deg)' },
				{ transform: 'translateX(6px) rotate(2deg)' },
				{ transform: 'translateX(-4px) rotate(-1deg)' },
				{ transform: 'none' }
			];
			await play(still ? flush : flush.map((frame, index) => ({ ...frame, ...shake[index] })), 420);
			return;
		}

		if (still) return;
		// A squash from the bottom, where it sits: shorter and wider, then back.
		await play(
			[
				{ transform: 'none' },
				{ transform: 'scale(1.06, 0.9)' },
				{ transform: 'scale(0.98, 1.03)' },
				{ transform: 'none' }
			],
			260
		);
	}
</script>

<button
	bind:this={button}
	type="button"
	class={['poke', className, { annoyed, away }]}
	aria-label={onpick ? m.home.raccoonPicker.open : m.home.pokeRaccoon}
	aria-haspopup={onpick ? 'dialog' : undefined}
	onclick={onpick ?? poke}
>
	<Mascot {name} {height} />
</button>

<style>
	.poke {
		display: block;
		padding: 0;
		border: 0;
		background: none;
		transform-origin: 50% 100%;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
		user-select: none;
		/* Calming down is slow; the flush itself is the animation's. */
		transition: filter 600ms ease-out;
	}

	.away {
		visibility: hidden;
	}

	/* `ANNOYED`, held while the count is past the hit. */
	.annoyed {
		filter: sepia(0.2) saturate(1.5) hue-rotate(-20deg);
	}
</style>
