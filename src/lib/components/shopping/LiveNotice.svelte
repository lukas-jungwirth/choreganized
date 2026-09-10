<!--
	"Elisabeth got **Tomatoes**" — a housemate changed the list while you were
	looking at it (→ SPEC §3.1, DECISIONS #135).

	The row has already ticked itself off where it stood, in their colour, which
	is the better signal because it is in the walking order you were reading. This
	is for when that isn't enough: the row is below the fold, or it went into a
	folded-up "recently bought", or the change was an *add* and there was no row
	of yours to animate at all.

	Deliberately not `UndoBar`, though it borrows its furniture — the 480px
	column, the inverted `--toast` pill, the `rise`. That bar is a way back out of
	something *you* did and it holds a button; this one is somebody else's news
	and there is nothing to press. So: their avatar where the sage circle sits, no
	action, and the page gives the undo bar the slot whenever both want it.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import type { LiveNoticeState } from '$lib/live-shopping.svelte';

	type Props = {
		notice: LiveNoticeState;
	};

	let { notice }: Props = $props();

	const m = messages();

	/**
	 * One name reads better than a number, so it is used whenever there is
	 * exactly one thing to name — a second event from the same person while this
	 * is still up rolls both into a count instead (→ `live-shopping.svelte.ts`).
	 */
	const parts = $derived.by(() => {
		const { kind, actor, name, count } = notice;
		if (kind === 'added') {
			return name && count === 1
				? m.shopping.live.added(actor.displayName, name)
				: m.shopping.live.addedMany(actor.displayName, count);
		}
		return name && count === 1
			? m.shopping.live.checked(actor.displayName, name)
			: m.shopping.live.checkedMany(actor.displayName, count);
	});
</script>

<div class="bar">
	<!-- Mounted per notice (the page keys it), so this announces once and says the
		 whole thing. `status` rather than `alert`: it is worth knowing, not worth
		 interrupting what is being read. -->
	<div class="row" role="status">
		<Avatar name={notice.actor.displayName} color={notice.actor.color} size={20} />
		<span class="text">
			{#each parts as part}{#if part.strong}<b>{part.text}</b>{:else}{part.text}{/if}{/each}
		</span>
	</div>
</div>

<style>
	/* `UndoBar`'s framing exactly — the two are the same piece of furniture and
	   never share the screen, so they must not sit a pixel apart when they swap. */
	.bar {
		position: fixed;
		bottom: calc(var(--tabbar-h) + var(--timer-dock-h) + env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		z-index: 12;
		width: 100%;
		max-width: 480px;
		padding: 0 var(--page-pad) 8px;
		animation: rise 180ms ease-out;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0;
		/* Even padding on the right, where the undo bar has a button instead. */
		padding: 10px 16px 10px 14px;
		border-radius: var(--r-sheet);
		background: var(--toast);
		box-shadow:
			inset 0 0 0 1px var(--toast-border),
			var(--shadow-toast);
		font-size: calc(15px * var(--fs));
		color: var(--toast-muted);
	}

	/* One line, always — the same reason the undo bar holds to one. */
	.text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.text b {
		font-weight: 700;
		color: var(--toast-text);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
		}
	}
</style>
