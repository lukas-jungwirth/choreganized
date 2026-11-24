<!--
	The count at the top of the review [R1] [R2] (→ plan 45): how many things
	the import asks about and has no answer to yet, in gold; once there are
	none, sage. A tap goes to the first open question.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';

	type Props = {
		/** The questions still open. */
		open: number;
		/** Whether there were any at all: "Nothing left to check" vs "Nothing to check". */
		asked: boolean;
		/** The line under the count. */
		line: string;
		onshow: () => void;
	};

	let { open, asked, line, onshow }: Props = $props();

	const m = messages();
	const t = m.cooking.import.review;
</script>

{#if open > 0}
	<button type="button" class="banner" aria-describedby="review-banner-line" onclick={onshow}>
		<span class="count" aria-hidden="true">{open}</span>
		<span class="words">
			<b>{t.count(open)}</b>
			<span id="review-banner-line">{line}</span>
		</span>
		<span class="sr-only">{t.showFirst}</span>
	</button>
{:else}
	<div class="banner ok" role="status">
		<span class="count" aria-hidden="true"><Check size={18} strokeWidth={2.6} /></span>
		<span class="words">
			<b>{asked ? t.allChecked : t.count(0)}</b>
			<span>{line}</span>
		</span>
	</div>
{/if}

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		margin-top: 14px;
		padding: 12px 14px;
		border-radius: var(--r-block);
		background: var(--gold-tint);
		color: var(--gold-deep);
		font-size: var(--fs-15);
		line-height: 1.35;
		text-align: left;
	}

	.banner.ok {
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.count {
		display: grid;
		place-items: center;
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--gold);
		font-size: var(--fs-16);
		font-weight: 700;
		color: var(--on-gold);
	}

	.ok .count {
		background: var(--sage);
		color: var(--on-sage);
	}

	.words {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	b {
		display: block;
		font-size: var(--fs-16);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
