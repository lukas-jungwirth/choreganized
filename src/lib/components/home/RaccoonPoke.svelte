<!--
	Home's raccoon, pokeable (→ SPEC §2, DECISIONS #223). A small game for
	whoever finds it:

	- every tap squashes it, a little wobble from its seat on the card;
	- the third is a hit — it shakes and flushes red for a moment;
	- the fourth and fifth it stays a little red, clearly annoyed;
	- the sixth it has had enough: it ducks behind the card and the next pose
	  of the season pops up in its place (the caller decides which, `onpoked`).

	Leave it alone for a few seconds and it calms down: the count starts over.
	Only on this phone and only until you leave Home — the household's raccoon
	is still the server's (`utils/raccoon`). With reduced motion it doesn't
	move at all: the tint still shows, and the swap is a fade.
-->
<script lang="ts">
	import type { MascotName } from '$lib/assets/mascot';
	import Mascot from '$lib/components/ui/Mascot.svelte';
	import { messages } from '$lib/i18n';

	type Props = {
		name: MascotName;
		height: number;
		/** The sixth tap, while the raccoon is out of sight: change `name` now. */
		onpoked: () => void;
		class?: string;
	};

	let { name, height, onpoked, class: className }: Props = $props();

	const m = messages();

	/** The hit, the annoyance after it, and the poke that sends it away. */
	const HIT = 3;
	const GONE = 6;
	/** How long it stays cross once you stop poking. */
	const CALM_DOWN = 3000;

	/*
	 * Red without a colour: the art keeps its own palette, like the member
	 * colours (→ DESIGN-SYSTEM "Light & dark"), so the tint shifts it rather
	 * than painting over it — and reads the same in both themes.
	 */
	const FLUSHED = 'sepia(0.7) saturate(4) hue-rotate(-40deg) brightness(0.95)';
	const ANNOYED = 'sepia(0.2) saturate(1.5) hue-rotate(-20deg)';

	let taps = $state(0);
	let busy = $state(false);
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
			onpoked();
			taps = 0;
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
	class={['poke', className, { annoyed }]}
	aria-label={m.home.pokeRaccoon}
	onclick={poke}
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

	/* `ANNOYED`, held while the count is past the hit. */
	.annoyed {
		filter: sepia(0.2) saturate(1.5) hue-rotate(-20deg);
	}
</style>
