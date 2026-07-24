<!--
	Dev-only component gallery (`/dev/kit`, 404 in production).

	Plan 02 builds the shared kit that 03/04/05/07/10 run in parallel on, so most
	of it has no screen yet. This page is where those components get looked at
	next to design/Hearth.dc.html instead of shipping unseen. Add to it whenever
	you add to `lib/components/ui`.
-->
<script lang="ts">
	import AwayControl from '$lib/components/AwayControl.svelte';
	import EnablePush from '$lib/components/EnablePush.svelte';
	import PrefRow from '$lib/components/settings/PrefRow.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import HomeIcon from '$lib/components/icons/HomeIcon.svelte';
	import ChefHatIcon from '$lib/components/icons/ChefHatIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import HistoryRow from '$lib/components/tasks/HistoryRow.svelte';
	import Podium from '$lib/components/tasks/Podium.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import AvatarStack from '$lib/components/ui/AvatarStack.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import SearchField from '$lib/components/ui/SearchField.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import CookStepText from '$lib/components/cooking/CookStepText.svelte';
	import type { FeedEntry, Podium as PodiumData } from '$lib/server/services/history';
	import { addDays, formatDateLabel } from '$lib/utils/dates';
	import { highlightStep } from '$lib/utils/step-highlight';
	import { UNITS } from '$lib/utils/shopping';
	import Bell from '@lucide/svelte/icons/bell';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	const MEMBERS = [
		{ id: 'l', displayName: 'Lukas', color: 'var(--member-sage)' },
		{ id: 'e', displayName: 'Elisabeth', color: 'var(--member-terracotta)' },
		{ id: 'm', displayName: 'Mira', color: 'var(--member-blue)' }
	];

	/**
	 * Podiums as the service hands them over — `entries` in rank order,
	 * `position` doing the arranging (→ services/history.ts).
	 */
	const PODIUM_THREE: PodiumData = {
		entries: [
			{ ...column('l', 240), rank: 1, position: 1, crowned: true },
			{ ...column('e', 210), rank: 2, position: 0, crowned: false },
			{ ...column('m', 160), rank: 3, position: 2, crowned: false }
		],
		resetsOn: '2026-08-01',
		leaderless: false
	};

	const PODIUM_TIED: PodiumData = {
		entries: [
			{ ...column('l', 180), rank: 1, position: 0, crowned: true },
			{ ...column('e', 180), rank: 1, position: 1, crowned: false }
		],
		resetsOn: '2026-08-01',
		leaderless: false
	};

	const PODIUM_LEADERLESS: PodiumData = {
		entries: [
			{ ...column('l', 0), rank: 1, position: 0, crowned: false },
			{ ...column('e', 0), rank: 1, position: 1, crowned: false }
		],
		resetsOn: '2026-08-01',
		leaderless: true
	};

	function column(id: string, points: number) {
		const member = MEMBERS.find((entry) => entry.id === id) ?? MEMBERS[0];
		return { memberId: member.id, displayName: member.displayName, color: member.color, points };
	}

	const FEED: FeedEntry[] = [
		{
			id: 'f1',
			taskName: 'Change the bedsheets',
			memberName: 'Lukas',
			memberColor: 'var(--member-sage)',
			points: 20,
			time: '8:20'
		},
		{
			id: 'f2',
			taskName: 'Water the plants',
			memberName: 'Elisabeth',
			memberColor: 'var(--member-terracotta)',
			points: 5,
			time: '7:45'
		},
		{
			// A housemate who has left: the snapshot keeps their name, the colour
			// is gone with their row.
			id: 'f3',
			taskName: 'Take out recycling',
			memberName: 'Marco',
			memberColor: null,
			points: 10,
			time: '19:10'
		}
	];

	let checked = $state(false);
	let away = $state(false);
	let view = $state('todo');
	let effort = $state(10);
	let assignee = $state('e');
	let quantity = $state<number | null>(1);
	let unit = $state('pcs');
	let query = $state('');
	let bannerBusy = $state(false);
	let bannerDismissed = $state(false);

	/** Shows the disabled/in-flight pill without needing a real subscription. */
	function demoBusy() {
		bannerBusy = true;
		setTimeout(() => (bannerBusy = false), 900);
	}
	let sheetOpen = $state(false);
	let leadSheetOpen = $state(false);
	let darkSheetOpen = $state(false);
	let modalOpen = $state(false);
	let cookMinutes = $state<number | null>(8);

	/** The design's own step [7b], so the underlines can be checked against it. */
	const COOK_INGREDIENTS = [
		{ id: 'p', name: 'Pasta', quantity: 400, unit: 'g' },
		{ id: 'm', name: 'Mushrooms', quantity: 250, unit: 'g' },
		{ id: 'b', name: 'Butter', quantity: 30, unit: 'g' }
	];

	const COOK_STEP = highlightStep(
		'Sauté the mushrooms in butter until golden, season well.',
		COOK_INGREDIENTS
	);
	let confirmOpen = $state(false);

	// The gallery has no household, so `today` comes from the load (one clock for
	// SSR and hydration) — enough to see DateField's caption change as you pick.
	let { data }: PageProps = $props();
	let due = $state(
		addDays(
			untrack(() => data.today),
			1
		)
	);
</script>

<svelte:head><title>UI kit · dev</title></svelte:head>

<div class="kit">
	<PageHeader title="UI kit" meta="dev only" />

	<section>
		<h2>SubHeader</h2>
		<SubHeader title="Stores" subtitle="Group your shopping list by shop" back="/dev/kit" />
	</section>

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
		<h2>Stepper · Select</h2>
		<div class="row top">
			<div class="qty">
				<Stepper label="Quantity" bind:value={quantity} clearable />
			</div>
			<div class="grow">
				<Select
					label="Unit"
					bind:value={unit}
					options={UNITS.map((value) => ({ value, label: value }))}
					hint="pcs · g · kg · ml · L …"
				/>
			</div>
		</div>
		<p class="note">
			Sunken on a white surface, white on the page — same `--input-surface` rule as TextField. The
			stepper's low end is "no quantity at all" when `clearable`.
		</p>
	</section>

	<section>
		<h2>DateField</h2>
		<DateField label="First due" bind:value={due} caption={formatDateLabel(due, data.today)} />
		<p class="note">
			A real `input type="date"` — the platform picker, the form action, and a friendly reading of
			the value on the right. The whole row opens the picker.
		</p>
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
		<p class="note">
			Give the options an `href` and the same shape becomes navigation — real links, real
			`aria-current`. That's the Tasks tab's To do / History switch:
		</p>
		<SegmentedControl
			label="Task view (links)"
			value="todo"
			options={[
				{ value: 'todo', label: 'To do · 4', href: '/tasks' },
				{ value: 'history', label: 'History', href: '/tasks/history' }
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
			{#if bannerDismissed}
				<p class="note">Dismissed — reload the page to bring it back.</p>
			{:else}
				<Banner
					variant="info"
					title="Turn on notifications"
					detail="Acts and dismisses — the pill is the button, the × is its own"
					action={bannerBusy ? 'Enabling…' : 'Enable'}
					disabled={bannerBusy}
					onclick={demoBusy}
					ondismiss={() => (bannerDismissed = true)}
					dismissLabel="Not now"
				>
					{#snippet icon()}<Bell size={18} strokeWidth={1.9} />{/snippet}
				</Banner>
			{/if}
		</div>
	</section>

	<section>
		<h2>EnablePush · PrefRow</h2>
		<p class="note">
			Live: it really subscribes this browser. `settings` is the row Settings [6a] groups with the
			preference toggles; `prompt` is the Home card, which renders nothing unless push is available
			and unanswered here. `PrefRow` saves on change — here into this page's no-op action.
		</p>
		<div class="col">
			<RowGroup>
				<EnablePush />
				<PrefRow
					pref="notifyTaskReminders"
					label="Task reminders"
					detail="The morning a task of yours is due"
					checked
				/>
				<PrefRow pref="notifyShoppingUpdates" label="Shopping list updates" checked={false} />
			</RowGroup>
			<EnablePush variant="prompt" />
		</div>
	</section>

	<section>
		<h2>AwayControl</h2>
		<p class="note">
			The holiday pause, in both surfaces: `sheet` under the snooze presets [4c], `row` in Settings'
			Away mode group [6a]. One component, so the two can't disagree about whether you're away.
		</p>
		<div class="col">
			<RowGroup><AwayControl today={data.today} awayUntil={null} surface="row" /></RowGroup>
			<!-- On white, because the sheet variant's sunken well is invisible
				 against the paper background it would never actually sit on. -->
			<Card radius="md">
				<div class="on-white">
					<AwayControl today={data.today} awayUntil={addDays(data.today, 6)} />
				</div>
			</Card>
		</div>
	</section>

	<section>
		<h2>SearchField</h2>
		<p class="note">
			White on the paper background, sunken inside a sheet (`--input-surface`) — the recipe library
			[7e] and the plan-a-meal sheet [3d].
		</p>
		<SearchField label="Search recipes" placeholder="Search recipes" bind:value={query} />
	</section>

	<section>
		<h2>RowGroup</h2>
		<p class="note">
			`card` is the settings block [6a] [6b]; `sunken` is the same block inside a white sheet — the
			••• menus [7c] and [6c]; `list` renders a `&lt;ul&gt;` for the groups whose rows are
			`&lt;li&gt;`s (the history feed [8a], the members list [6b]).
		</p>
		<div class="col">
			<RowGroup>
				<div class="pad">Notifications</div>
				<div class="pad">Members</div>
			</RowGroup>
			<RowGroup surface="sunken">
				<div class="pad">Edit recipe</div>
				<div class="pad">Duplicate</div>
			</RowGroup>
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
			<Button variant="secondary" onclick={() => (leadSheetOpen = true)}>
				…with a lead & subtitle
			</Button>
			<Button variant="secondary" onclick={() => (modalOpen = true)}>Open centre modal</Button>
		</div>
	</section>

	<section>
		<h2>Cook mode (dark) [7b]</h2>
		<p class="note">
			The step text with its ingredient underlines read out of the sentence (→ DECISIONS #14), and
			the dark <code>tone</code> both BottomSheet and Stepper grew for these screens. The ring [7h]
			and the ingredients peek want a live timer, so they only make sense on the real screen —
			<code>/cooking/recipes/…/cook</code>.
		</p>
		<div class="cook-panel">
			<CookStepText segments={COOK_STEP.segments} />
			<p class="cook-uses">
				This step uses <b>{COOK_STEP.used.map((i) => i.name).join(' · ')}</b>
			</p>
		</div>
		<div class="sheet-cta">
			<Button variant="secondary" onclick={() => (darkSheetOpen = true)}>Open dark sheet</Button>
		</div>
	</section>

	<section>
		<h2>Podium [8a]</h2>
		<p class="note">
			Three members as the design draws them, then the two-member tie (equal columns, crown to the
			earlier joiner → DECISIONS #75) and the 1st of the month, before anybody has scored.
		</p>
		<div class="col">
			<Podium podium={PODIUM_THREE} />
			<Podium podium={PODIUM_TIED} />
			<Podium podium={PODIUM_LEADERLESS} />
		</div>
	</section>

	<section>
		<h2>HistoryRow [8a]</h2>
		<RowGroup list>
			{#each FEED as entry (entry.id)}
				<HistoryRow {entry} />
			{/each}
		</RowGroup>
	</section>

	<section>
		<h2>Icons</h2>
		<div class="row">
			<HomeIcon />
			<BasketIcon />
			<ChefHatIcon />
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
	<div class="row top sheet-cta">
		<div class="qty">
			<Stepper label="Quantity" bind:value={quantity} clearable />
		</div>
		<div class="grow">
			<Select
				label="Unit"
				bind:value={unit}
				options={UNITS.map((value) => ({ value, label: value }))}
				hint="pcs · g · kg · ml · L …"
			/>
		</div>
	</div>
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

<!-- The manage-member header [6c]: an avatar beside a two-line title. -->
<BottomSheet bind:open={leadSheetOpen} title="Elisabeth" subtitle="Member · joined Jul 4 · 210 pts">
	{#snippet lead()}
		<Avatar name="Elisabeth" color="var(--member-terracotta)" size={52} />
	{/snippet}
	<p class="note">`lead` renders before the titles, `subtitle` under them.</p>
	<Button variant="secondary" onclick={() => (leadSheetOpen = false)}>Close</Button>
</BottomSheet>

<BottomSheet bind:open={darkSheetOpen} title="Set a timer" subtitle="It rings even with the phone locked." tone="dark">
	<Stepper label="Minutes" bind:value={cookMinutes} min={1} max={720} tone="dark" />
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

	.top {
		align-items: flex-start;
	}

	.qty {
		flex: none;
		width: 148px;
	}

	.grow {
		flex: 1;
		min-width: 0;
	}

	.note {
		margin: 12px 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-5);
	}

	.pad {
		padding: 16px;
		font-size: 14px;
	}

	/* A sheet's own padding, so the demo sits the way it really would. */
	.on-white {
		padding: 16px 22px 22px;
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

	/* A patch of the one dark screen in the app, so the amber reads against the
		 background it was drawn for rather than against paper. */
	.cook-panel {
		padding: 22px;
		border-radius: var(--r-card);
		background: var(--cook-bg);
	}

	.cook-uses {
		margin: 14px 0 0;
		font-size: 12.5px;
		color: var(--cook-faint);
	}

	.cook-uses b {
		font-weight: 600;
		color: var(--cook-text-2);
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
