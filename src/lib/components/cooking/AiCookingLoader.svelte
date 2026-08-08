<!--
	The wait while the model reads a recipe [plan 14] can be several seconds, so it
	gets a cozy overlay rather than a bare spinner: a steaming pot that gently bobs,
	and a line of playful copy that cycles as it works. `role="status"` +
	`aria-live` announces the copy to a screen reader; the animation bows out under
	`prefers-reduced-motion` (the message still cycles).
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import { onMount } from 'svelte';

	const m = messages();
	const phrases = m.cooking.import.ai.loading;

	let index = $state(0);

	onMount(() => {
		const timer = setInterval(() => {
			index = (index + 1) % phrases.length;
		}, 1800);
		return () => clearInterval(timer);
	});
</script>

<div class="overlay" role="status" aria-live="polite">
	<div class="card">
		<div class="pot">
			<span class="steam a" aria-hidden="true"></span>
			<span class="steam b" aria-hidden="true"></span>
			<span class="steam c" aria-hidden="true"></span>
			<CookingPot size={46} strokeWidth={1.5} />
		</div>
		{#key index}
			<p class="msg">{phrases[index]}</p>
		{/key}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: var(--scrim);
		backdrop-filter: blur(2px);
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		width: min(280px, 80vw);
		padding: 32px 28px;
		border-radius: var(--r-card-lg);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.pot {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		color: var(--sage);
		animation: bob 2.6s ease-in-out infinite;
	}

	/* Wisps rising from the pot's mouth, staggered so one is always on its way up. */
	.steam {
		position: absolute;
		top: 15px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-disabled);
		filter: blur(0.5px);
		opacity: 0;
		animation: rise 2.4s ease-in-out infinite;
	}

	.steam.a {
		left: 21px;
		animation-delay: 0s;
	}

	.steam.b {
		left: 28px;
		animation-delay: 0.8s;
	}

	.steam.c {
		left: 35px;
		animation-delay: 1.6s;
	}

	.msg {
		margin: 0;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
		text-align: center;
		animation: fade 0.45s ease-out;
	}

	@keyframes bob {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-3px);
		}
	}

	@keyframes rise {
		0% {
			transform: translateY(6px) scale(0.5);
			opacity: 0;
		}
		30% {
			opacity: 0.85;
		}
		100% {
			transform: translateY(-15px) scale(1.25);
			opacity: 0;
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pot,
		.steam,
		.msg {
			animation: none;
		}
		.steam {
			display: none;
		}
	}
</style>
