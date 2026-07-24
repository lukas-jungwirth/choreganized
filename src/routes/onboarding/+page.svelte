<!-- Create or join a household [5b] — the first screen after signing in. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import House from '@lucide/svelte/icons/house';
	import Plus from '@lucide/svelte/icons/plus';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	let choice = $state<'create' | 'join'>('create');
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.onboarding.start.title)}</title>
</svelte:head>

<Screen>
	<header>
		<h1>{m.onboarding.start.welcome(data.firstName)}</h1>
		<p class="sub">{m.onboarding.start.question}</p>
	</header>

	<form method="POST" use:enhance>
		<label class="option" class:selected={choice === 'create'}>
			<input type="radio" name="choice" value="create" bind:group={choice} />
			<span class="tick" aria-hidden="true"><Check size={12} strokeWidth={3.5} /></span>
			<span class="well sage"><House size={24} strokeWidth={1.9} /></span>
			<span class="title">{m.onboarding.start.createTitle}</span>
			<span class="copy">{m.onboarding.start.createCopy}</span>
		</label>

		<label class="option" class:selected={choice === 'join'}>
			<input type="radio" name="choice" value="join" bind:group={choice} />
			<span class="tick" aria-hidden="true"><Check size={12} strokeWidth={3.5} /></span>
			<span class="well"><Plus size={24} strokeWidth={1.9} /></span>
			<span class="title">{m.onboarding.start.joinTitle}</span>
			<span class="copy">{m.onboarding.start.joinCopy}</span>
		</label>

		<div class="cta"><Button type="submit">{m.onboarding.start.continue}</Button></div>
	</form>
</Screen>

<style>
	header {
		margin: 20px 0 28px;
	}

	h1 {
		font-size: 30px;
		line-height: 1.1;
	}

	.sub {
		margin: 8px 0 0;
		font-size: 15px;
		color: var(--text-4);
	}

	form {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.option {
		position: relative;
		display: grid;
		grid-template-columns: 1fr;
		padding: 20px;
		margin-bottom: 14px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-card-lg);
		background: var(--card);
		cursor: pointer;
	}

	.option.selected {
		border: 2px solid var(--sage);
		/* Keeps the card from shifting 0.5px when the border thickens. */
		padding: 19.5px;
	}

	.option input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.tick {
		position: absolute;
		top: 18px;
		right: 18px;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--sage);
		color: var(--on-sage);
		opacity: 0;
	}

	.option.selected .tick {
		opacity: 1;
	}

	.option input:focus-visible ~ .well {
		box-shadow: 0 0 0 2px var(--ink);
	}

	.well {
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		margin-bottom: 14px;
		border-radius: var(--r-input);
		background: var(--divider);
		color: var(--text-4);
	}

	.well.sage {
		background: var(--sage-tint);
		color: var(--sage);
	}

	.title {
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 600;
	}

	.copy {
		margin-top: 5px;
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--text-4);
	}

	.cta {
		margin-top: auto;
		padding-top: 18px;
	}
</style>
