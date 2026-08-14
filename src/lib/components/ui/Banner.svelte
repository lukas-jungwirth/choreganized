<!--
	Tinted status card: overdue on Home [4e] (danger) and the holiday pause on
	Tasks [4a] (info). Calm, not alarming — even "overdue" is a soft tint.

	Three shapes, in order of how much of the card is tappable:

	- `href` — the whole card is the link and the pill is just its label, which
	  is a far bigger touch target than the 60px pill the mockup draws. Nothing
	  else interactive fits inside it, so `onclick`/`ondismiss` step aside.
	- `onclick` — the pill itself is the button, and `ondismiss` adds a × beside
	  it. Two controls rather than one card, because a button inside a
	  card-sized button isn't valid HTML.
	- neither — it only informs.

	`choices` is the fourth shape and the only one that reads as a question: two
	answers, both named in full, on a row of their own under the text. A banner
	whose second answer won't fit in a 60px pill — "Remind me tomorrow" beside
	"Got it" [holiday notice] — has to say both out loud rather than hide one
	behind an × nobody can read (→ DECISIONS #131).
-->
<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { messages } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	type Props = {
		variant?: 'danger' | 'info';
		title: string;
		/** Second line — the detail under the headline. */
		detail?: string;
		/** Label of the trailing pill; omit for a banner that only informs. */
		action?: string;
		href?: string;
		/** Makes the pill a button instead. Ignored when `href` is set. */
		onclick?: () => void;
		/** Greys the pill out mid-flight. */
		disabled?: boolean;
		/** Adds a trailing × — for banners the reader is allowed to be done with.
		 *  Also ignored when `href` is set (see above). */
		ondismiss?: () => void;
		/** Overrides the generic "Dismiss" where the banner can say what it drops. */
		dismissLabel?: string;
		/**
		 * Two (or more) named answers, on their own row under the text. For a
		 * banner that asks something rather than pointing somewhere; ignored when
		 * `href` is set, for the same reason `onclick` is.
		 */
		choices?: { label: string; onclick: () => void }[];
		/** The icon for the leading tile, sized by the variant. */
		icon: Snippet;
	};

	let {
		variant = 'danger',
		title,
		detail,
		action,
		href,
		onclick,
		disabled = false,
		ondismiss,
		dismissLabel,
		choices,
		icon
	}: Props = $props();

	const m = messages();
</script>

{#snippet body()}
	<span class="tile">{@render icon()}</span>
	<span class="text">
		<span class="title">{title}</span>
		{#if detail}<span class="detail">{detail}</span>{/if}
		{#if choices && !href}
			<span class="choices">
				{#each choices as choice (choice.label)}
					<button class="choice" type="button" {disabled} onclick={choice.onclick}>
						{choice.label}
					</button>
				{/each}
			</span>
		{/if}
	</span>
	{#if action}
		{#if href || !onclick}
			<span class="action">{action}</span>
		{:else}
			<button class="action" type="button" {disabled} {onclick}>{action}</button>
		{/if}
	{/if}
	{#if ondismiss && !href}
		<button
			class="dismiss"
			type="button"
			aria-label={dismissLabel ?? m.ui.dismiss}
			onclick={ondismiss}
		>
			<X size={16} strokeWidth={2.2} />
		</button>
	{/if}
{/snippet}

{#if href}
	<a class="banner {variant}" {href}>{@render body()}</a>
{:else}
	<div class="banner {variant}">{@render body()}</div>
{/if}

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: 13px;
		border: 1px solid;
		color: inherit;
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.title {
		display: block;
		font-weight: 700;
	}

	.detail {
		display: block;
		margin-top: 2px;
	}

	.action,
	.choice {
		padding: 7px 13px;
		border-radius: var(--r-chip);
		background: var(--card);
		font-size: calc(13px * var(--fs));
		font-weight: 700;
	}

	.action {
		flex: none;
	}

	/* The answers get the full width of the text column rather than the scraps a
	   pill leaves beside it — "Remind me tomorrow" has to be readable. Wrapping
	   is the fallback at the largest type scales. */
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 11px;
	}

	button.action:disabled,
	.choice:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.dismiss {
		display: grid;
		place-items: center;
		flex: none;
		/* Bleeds into the banner's padding so the × sits on the edge the mockups
		   draw the pill against, while still hitting a 28px target. */
		width: 28px;
		height: 28px;
		margin: -6px -6px -6px -2px;
		border-radius: var(--r-chip);
		color: var(--text-5);
	}

	/* ── Overdue [4e] ─────────────────────────────────────────────────────── */
	.danger {
		padding: 15px 16px;
		border-radius: var(--r-card);
		border-color: var(--danger-border);
		background: var(--danger-tint);
	}

	.danger .tile {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--danger);
		color: var(--on-sage);
	}

	.danger .title {
		font-size: calc(14px * var(--fs));
		color: var(--danger-deep);
	}

	.danger .detail {
		font-size: calc(12.5px * var(--fs));
		color: var(--danger-soft);
	}

	.danger .action,
	.danger .choice {
		color: var(--danger);
	}

	/* ── Holiday pause [4a] ───────────────────────────────────────────────── */
	.info {
		gap: 12px;
		padding: 12px 14px;
		border-radius: var(--r-button);
		border-color: var(--info-border);
		background: var(--info-tint);
	}

	.info .tile {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--card);
		color: var(--sage);
	}

	.info .title {
		font-size: calc(13.5px * var(--fs));
		color: var(--sage-deep);
	}

	.info .detail {
		font-size: calc(12px * var(--fs));
		color: var(--info-soft);
	}

	.info .action,
	.info .choice {
		color: var(--sage);
	}

	a.banner {
		transition: transform 120ms ease-out;
	}

	a.banner:active {
		transform: scale(0.99);
	}

	@media (prefers-reduced-motion: reduce) {
		a.banner {
			transition: none;
		}
		a.banner:active {
			transform: none;
		}
	}
</style>
