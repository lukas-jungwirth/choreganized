<!--
	Every list gets one [7d] [7e] [7f]: icon well, a warm line about what's
	missing, and the one button that fixes it. The `action` snippet is free-form
	so a screen can offer more than a single button (Tasks pairs starters with a
	"create your own" [7f]).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		icon: Snippet;
		/** The explanatory copy — a sentence, not a label. */
		children: Snippet;
		action?: Snippet;
	};

	let { title, icon, children, action }: Props = $props();
</script>

<div class="empty">
	<div class="well">{@render icon()}</div>
	<h2>{title}</h2>
	<!-- A div, not a <p>: callers pass a free-form snippet, and block content
		 inside a paragraph reparses into different markup than SSR emitted. -->
	<div class="copy">{@render children()}</div>
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.empty {
		padding: 8px 18px 26px;
		text-align: center;
	}

	.well {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 88px;
		height: 88px;
		margin: 0 auto 22px;
		border-radius: 26px;
		background: var(--sunken);
		color: var(--text-disabled);
	}

	h2 {
		margin-bottom: 8px;
		font-size: 21px;
	}

	.copy {
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.action {
		margin-top: 22px;
	}
</style>
