<!--
	Dev-only component gallery (`/dev/kit`, 404 in production).

	Plan 02 builds the shared kit that 03/04/05/07/10 run in parallel on, so most
	of it has no screen yet. This page is where those components get looked at
	next to design/Hearth.dc.html instead of shipping unseen. Add to it whenever
	you add to `lib/components/ui`.
-->
<script lang="ts">
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import HomeIcon from '$lib/components/icons/HomeIcon.svelte';
	import PotIcon from '$lib/components/icons/PotIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import AvatarStack from '$lib/components/ui/AvatarStack.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';

	const MEMBERS = [
		{ id: 'l', displayName: 'Lukas', color: 'var(--member-sage)' },
		{ id: 'e', displayName: 'Elisabeth', color: 'var(--member-terracotta)' },
		{ id: 'm', displayName: 'Mira', color: 'var(--member-blue)' }
	];

	let checked = $state(false);
	let away = $state(false);
	let view = $state('todo');
	let effort = $state(10);
	let assignee = $state('e');
	let sheetOpen = $state(false);
	let modalOpen = $state(false);
	let confirmOpen = $state(false);
</script>

<svelte:head><title>UI kit · dev</title></svelte:head>

<div class="kit">
	<PageHeader title="UI kit" meta="dev only" />

	<section>
		<h2>Button</h2>
		<div class="col">
			<Button>Primary</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="dark">Start cook mode</Button>
			<Button variant="danger">Leave household</Button>
			<Button disabled>Disabled</Button>
		</div>
	</section>

	<section>
		<h2>TextField</h2>
		<TextField label="Household name" name="demo-name" value="Sonnengasse 12" />
		<TextField label="Display name" name="demo-error" value="" error="Enter a name" />
	</section>

	<section>
		<h2>Avatar · AvatarStack</h2>
		<div class="row">
			<Avatar name="Lukas" color="var(--member-sage)" size={52} />
			<Avatar name="Elisabeth" color="var(--member-terracotta)" size={36} />
			<Avatar name="Mira" color="var(--member-blue)" size={26} />
			<Avatar empty size={32}><Plus size={14} strokeWidth={2} /></Avatar>
		</div>
		<div class="row">
			<AvatarStack members={MEMBERS} />
			<AvatarStack members={MEMBERS} size={26} />
		</div>
	</section>

	<section>
		<h2>CheckCircle</h2>
		<div class="row">
			<CheckCircle />
			<CheckCircle checked />
			<CheckCircle checked size={24} color="var(--terracotta)" />
			<CheckCircle checked tinted size={28} color="var(--member-sage)" />
			<CheckCircle checked tinted size={28} color="var(--member-terracotta)" />
			<CheckCircle checked tinted size={28} color="var(--member-plum)" />
		</div>
	</section>

	<section>
		<h2>Chip</h2>
		<div class="row wrap">
			<Chip>Small · 5</Chip>
			<Chip selected>Medium · 10</Chip>
			<Chip disabled>Large · 20</Chip>
		</div>
		<div class="row wrap">
			{#each ['Small · 5', 'Medium · 10', 'Large · 20', 'Very large · 40'] as label, index (label)}
				{@const points = [5, 10, 20, 40][index]}
				<Chip selected={effort === points} onclick={() => (effort = points)}>{label}</Chip>
			{/each}
		</div>
		<div class="row wrap">
			{#each MEMBERS as member (member.id)}
				<Chip
					color={member.color}
					selected={assignee === member.id}
					onclick={() => (assignee = member.id)}
				>
					<Avatar name={member.displayName} color={member.color} size={24} />
					{member.displayName}
				</Chip>
			{/each}
			<Chip selected={assignee === 'any'} onclick={() => (assignee = 'any')}>Anyone</Chip>
		</div>
	</section>

	<section>
		<h2>SegmentedControl</h2>
		<SegmentedControl
			label="Task view"
			bind:value={view}
			options={[
				{ value: 'todo', label: 'To do · 4' },
				{ value: 'history', label: 'History' }
			]}
		/>
	</section>

	<section>
		<h2>Toggle</h2>
		<div class="pref">
			<div>
				<div class="pref-title">Alternate each time</div>
				<div class="pref-sub">Lukas → Elisabeth → Lukas …</div>
			</div>
			<Toggle bind:checked label="Alternate each time" />
		</div>
		<div class="pref">
			<div class="pref-title">Going away?</div>
			<Toggle bind:checked={away} label="Going away" />
		</div>
	</section>

	<section>
		<h2>ProgressBar</h2>
		<div class="col">
			<ProgressBar value={0.8} color="var(--member-sage)" label="Lukas · 240 points" />
			<ProgressBar value={0.7} color="var(--member-terracotta)" label="Elisabeth · 210 points" />
		</div>
	</section>

	<section>
		<h2>Banner</h2>
		<div class="col">
			<Banner
				title="1 task overdue"
				detail="Change the bedsheets · your turn"
				action="View"
				href="/home"
			>
				{#snippet icon()}<Bell size={20} strokeWidth={2} />{/snippet}
			</Banner>
			<Banner
				variant="info"
				title="Lukas is away until Jul 28"
				detail="His tasks are paused — nothing counts as overdue"
			>
				{#snippet icon()}<Send size={18} strokeWidth={1.8} />{/snippet}
			</Banner>
		</div>
	</section>

	<section>
		<h2>Card</h2>
		<div class="col">
			<Card><div class="pad">Radius lg (22) · dashboard cards</div></Card>
			<Card radius="md"><div class="pad">Radius md (20) · list & tile cards</div></Card>
			<Card href="/dev/kit"><div class="pad">Tappable card</div></Card>
		</div>
	</section>

	<section>
		<h2>EmptyState</h2>
		<EmptyState title="Nothing to buy yet">
			{#snippet icon()}<BasketIcon size={40} strokeWidth={1.6} />{/snippet}
			Add items as you run out — they'll be grouped by store for whoever does the shopping.
			{#snippet action()}
				<Button>Add first item</Button>
			{/snippet}
		</EmptyState>
	</section>

	<section>
		<h2>BottomSheet · CenterModal</h2>
		<div class="col">
			<Button variant="secondary" onclick={() => (sheetOpen = true)}>Open bottom sheet</Button>
			<Button variant="secondary" onclick={() => (modalOpen = true)}>Open centre modal</Button>
		</div>
	</section>

	<section>
		<h2>Icons</h2>
		<div class="row">
			<HomeIcon />
			<BasketIcon />
			<PotIcon />
			<ChecklistIcon />
			<span class="gold"><CrownIcon /></span>
		</div>
	</section>

	<p class="foot">FAB is pinned bottom-right, above where the tab bar would be.</p>
</div>

<FAB label="New task" onclick={() => (sheetOpen = true)}>
	<Plus size={24} strokeWidth={2.4} />
</FAB>

<BottomSheet bind:open={sheetOpen} title="Add item" eyebrow="Grocery">
	<TextField label="Item" name="demo-item" value="Sourdough bread" />
	<div class="sheet-cta">
		<Button onclick={() => (sheetOpen = false)}>Add to Grocery list</Button>
	</div>
	<div class="sheet-cta">
		<Button variant="secondary" onclick={() => (confirmOpen = true)}>Delete item…</Button>
	</div>

	<!--
		The composition plans 04 and 07 need — a confirm raised from inside a
		sheet. Keep it here: it is the case that exercises the ref-counted scroll
		lock and the Escape-stops-at-the-topmost-dialog rule.
	-->
	<CenterModal bind:open={confirmOpen} label="Delete item" dismissible={false}>
		<h3>Delete this item?</h3>
		<p class="pop-sub">It disappears from everyone's list.</p>
		<Button variant="danger" onclick={() => (confirmOpen = false)}>Delete</Button>
	</CenterModal>
</BottomSheet>

<CenterModal bind:open={modalOpen} label="Task completed">
	<div class="pop"><Check size={36} strokeWidth={3} /></div>
	<h3>Nice work, Elisabeth!</h3>
	<p class="pop-sub">Bedsheets changed · logged to history</p>
	<Button onclick={() => (modalOpen = false)}>Close</Button>
</CenterModal>

<style>
	.kit {
		max-width: 480px;
		margin: 0 auto;
		padding: 8px var(--page-pad) 160px;
	}

	section {
		margin-bottom: 34px;
	}

	h2 {
		margin-bottom: 12px;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 10px;
	}

	.wrap {
		flex-wrap: wrap;
	}

	.pad {
		padding: 16px;
		font-size: 14px;
	}

	.pref {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
		padding: 12px 14px;
		border-radius: var(--r-input);
		background: var(--sunken);
	}

	.pref-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}

	.pref-sub {
		margin-top: 2px;
		font-size: 12px;
		color: var(--text-4);
	}

	.gold {
		color: var(--gold);
	}

	.foot {
		font-size: 12px;
		color: var(--text-5);
	}

	.sheet-cta {
		margin-top: 20px;
	}

	.pop {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		margin: 0 auto 20px;
		border-radius: 50%;
		background: var(--sage);
		color: var(--on-sage);
		box-shadow: var(--shadow-button);
	}

	h3 {
		margin-bottom: 6px;
		font-size: 24px;
	}

	.pop-sub {
		margin: 0 0 20px;
		font-size: 14px;
		color: var(--text-4);
	}
</style>
