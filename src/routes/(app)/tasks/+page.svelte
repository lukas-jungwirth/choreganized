<!--
	Tasks [05] [4a] — the heart of the app: who owes the household what, and what
	it's worth.

	The screen is one list in five moods (overdue · today · upcoming · paused ·
	undated), a summary link across to History [8a], and the sheets hanging off it:
	new / edit [3b], detail [4b], snooze [4c], the "who did it?" choice and the
	celebration [4d]. Each is state rather than a route (→ DECISIONS #17), mounted
	only while it's open, which is what resets its form.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import SnoozeSheet from '$lib/components/tasks/SnoozeSheet.svelte';
	import TaskDetailSheet from '$lib/components/tasks/TaskDetailSheet.svelte';
	import TaskDoneChoiceModal from '$lib/components/tasks/TaskDoneChoiceModal.svelte';
	import TaskDoneModal from '$lib/components/tasks/TaskDoneModal.svelte';
	import TaskFormSheet from '$lib/components/tasks/TaskFormSheet.svelte';
	import TaskRow from '$lib/components/tasks/TaskRow.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { messages } from '$lib/i18n';
	import type { CompletionResult, Standing, TaskListItem } from '$lib/server/services/tasks';
	import { STARTERS } from '$lib/utils/tasks';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	/** Which sheet is up, and what it's about. Null = none. */
	type Sheet =
		| { kind: 'form'; task: TaskListItem | null }
		| { kind: 'detail'; task: TaskListItem }
		| { kind: 'snooze'; task: TaskListItem };

	let sheet = $state<Sheet | null>(null);
	let done = $state<{ completion: CompletionResult; standing: Standing } | null>(null);
	/** The task awaiting a "who did it?" answer — someone else's, ticked off [4d]. */
	let choice = $state<TaskListItem | null>(null);

	/** Ticked but not yet confirmed — the circle fills before the server agrees. */
	const pending = new SvelteSet<string>();

	const empty = $derived(data.list.total === 0);
	/** A brand-new household gets [7f] and nothing else; anything else gets the chrome. */
	const furnished = $derived(!empty || data.hasHistory);

	const away = $derived(
		data.members.filter((member) => member.awayUntil !== null && member.awayUntil >= data.today)
	);

	const view = $derived([
		{ value: 'todo', label: m.tasks.view.todo, href: '/tasks' },
		{ value: 'history', label: m.tasks.view.history, href: '/tasks/history' }
	]);

	/** The summary link's line: how much got done this week, and the way through. */
	const summaryLabel = $derived(
		data.doneThisWeek > 0
			? `${m.tasks.summary.doneThisWeek(data.doneThisWeek)} · ${m.tasks.summary.seeHistory}`
			: m.tasks.summary.seeHistory
	);

	/**
	 * The completion handler every check circle and the detail sheet's CTA share
	 * — so wherever you tick a task off, the row goes quiet at once and the same
	 * celebration comes back.
	 */
	function complete(task: TaskListItem): SubmitFunction {
		return () => {
			pending.add(task.id);

			return async ({ result, update }) => {
				await update({ reset: false });
				pending.delete(task.id);

				if (result.type !== 'success') return;
				const completed = result.data?.completed as typeof done;
				if (!completed) return;

				// The task is finished with; the celebration takes the screen — over
				// whichever surface raised it (a row, the detail sheet, or the choice).
				sheet = null;
				choice = null;
				done = completed;
			};
		};
	}

	/** The starters and "Create a custom task" both leave the empty state behind. */
	const afterStarter: SubmitFunction =
		() =>
		async ({ update }) =>
			update({ reset: false });
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.tasks.title)}</title>
</svelte:head>

<PageHeader title={m.tasks.title} />

{#if furnished}
	<div class="view">
		<SegmentedControl label={m.tasks.view.label} value="todo" options={view} />
	</div>
{/if}

{#each away as member (member.id)}
	{@const mine = member.id === data.currentMember.id}
	{@const until = m.date.short(member.awayUntil ?? data.today)}
	<div class="banner">
		<Banner
			variant="info"
			title={mine
				? m.tasks.awayBanner.mine(until)
				: m.tasks.awayBanner.other(member.displayName, until)}
			detail={mine ? m.tasks.awayBanner.detailMine : m.tasks.awayBanner.detailOther}
		>
			{#snippet icon()}<Send size={18} strokeWidth={1.8} />{/snippet}
		</Banner>
	</div>
{/each}

{#if empty}
	<EmptyState title={m.tasks.empty.title}>
		{#snippet icon()}<ChecklistIcon size={38} strokeWidth={1.6} />{/snippet}
		{m.tasks.empty.copy}
		{#snippet action()}
			<div class="starters">
				<p class="label">{m.tasks.empty.starters}</p>
				{#each STARTERS as starter (starter.key)}
					{@const name = m.task.starters[starter.key]}
					<form method="POST" action="?/create" use:enhance={afterStarter}>
						<!-- The chore is written into the database in the language it
							 was tapped in; from then on it is the household's text. -->
						<input type="hidden" name="name" value={name} />
						<input type="hidden" name="points" value={starter.points} />
						<input type="hidden" name="recurUnit" value={starter.unit} />
						<input type="hidden" name="recurInterval" value={starter.interval} />
						<!-- Assignee "Anyone", first due today (→ DECISIONS #22). -->
						<input type="hidden" name="dueDate" value={data.today} />
						<button type="submit" class="starter">
							<span class="starter-name">{name}</span>
							<span class="starter-repeat">{m.task.repeat(starter.unit, starter.interval)}</span>
							<span class="starter-add" aria-hidden="true"
								><Plus size={15} strokeWidth={2.4} /></span
							>
						</button>
					</form>
				{/each}
			</div>
			<Button onclick={() => (sheet = { kind: 'form', task: null })}>
				{m.tasks.empty.custom}
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	{#each data.list.sections as section (section.key)}
		{@const label = m.tasks.sections[section.key]}
		<section>
			<h2 class="section" class:overdue={section.key === 'overdue'}>
				{#if section.key === 'overdue'}
					<span class="dot" aria-hidden="true"></span>
					<!-- One expression rather than markup around a "·": the separator
						 sits between two values, and Svelte collapses the whitespace
						 either side of a block boundary. -->
					<span>{label} · {section.tasks.length}</span>
				{:else}
					<span>{label}</span>
				{/if}
			</h2>
			<ul class="rows">
				{#each section.tasks as task (task.id)}
					<TaskRow
						{task}
						today={data.today}
						currentMemberId={data.currentMember.id}
						pending={pending.has(task.id)}
						complete={complete(task)}
						onchoose={() => (choice = task)}
						onopen={() => (sheet = { kind: 'detail', task })}
					/>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

{#if furnished}
	<!-- Replaces the recent-history preview [05]: how much got done lately, and the
		 way through to the full History screen. -->
	<a class="summary" href="/tasks/history">
		<Check size={17} strokeWidth={2.4} aria-hidden="true" />
		<span class="summary-text">{summaryLabel}</span>
		<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
	</a>
{/if}

{#if !empty}
	<FAB label={m.tasks.newTask} onclick={() => (sheet = { kind: 'form', task: null })}>
		<Plus size={24} strokeWidth={2.4} />
	</FAB>
{/if}

{#if sheet?.kind === 'form'}
	<TaskFormSheet
		task={sheet.task}
		members={data.members}
		today={data.today}
		onclose={() => (sheet = null)}
	/>
{:else if sheet?.kind === 'detail'}
	{@const task = sheet.task}
	<TaskDetailSheet
		{task}
		members={data.members}
		today={data.today}
		currentMemberId={data.currentMember.id}
		complete={complete(task)}
		onchoose={() => (choice = task)}
		onsnooze={() => (sheet = { kind: 'snooze', task })}
		onedit={() => (sheet = { kind: 'form', task })}
		onclose={() => (sheet = null)}
	/>
{:else if sheet?.kind === 'snooze'}
	<SnoozeSheet
		task={sheet.task}
		today={data.today}
		awayUntil={data.currentMember.awayUntil}
		onclose={() => (sheet = null)}
	/>
{/if}

{#if choice}
	{@const task = choice}
	<TaskDoneChoiceModal
		{task}
		currentMemberId={data.currentMember.id}
		complete={complete(task)}
		onclose={() => (choice = null)}
	/>
{/if}

{#if done}
	<TaskDoneModal
		completion={done.completion}
		standing={done.standing}
		onclose={() => (done = null)}
	/>
{/if}

<style>
	.view {
		margin-bottom: 20px;
	}

	/* The link across to History that replaced the recent-history preview [05]. */
	.summary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 22px;
		padding: 15px;
		border-radius: var(--r-block);
		background: var(--sage-tint);
		font-size: 14px;
		font-weight: 600;
		color: var(--sage-deep);
	}

	.summary:active {
		background: var(--sage-row);
	}

	.summary-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.banner {
		margin-bottom: 20px;
	}

	section {
		margin-bottom: 20px;
	}

	.section {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 4px 8px;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.overdue {
		color: var(--danger);
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--danger);
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 11px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* [7f] pairs the starters with the button, so the action block goes wide and
	   left-aligned while the copy above it stays centred. */
	.starters {
		margin-bottom: 20px;
		text-align: left;
	}

	.label {
		margin: 0 4px 10px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.starter {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		margin-bottom: 9px;
		padding: 13px 15px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
		text-align: left;
	}

	.starter-name {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 500;
	}

	.starter-repeat {
		flex: none;
		font-size: 12px;
		color: var(--text-4);
	}

	.starter-add {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: var(--sage-tint);
		color: var(--sage);
	}

	.starter:active {
		background: var(--sage-row);
	}
</style>
