/**
 * Every word the app says, in English — the language the design is drawn in and
 * the one the copy is authored against (`design/Hearth.dc.html`, docs/SPEC.md).
 *
 * **This file is the schema.** `Messages` is `typeof en`, and `de.ts` is typed
 * as `Messages`, so a key added here without a German twin fails `npm run
 * check` rather than falling back to English at runtime. There is no lookup by
 * string and no missing-key path: `m.tasks.title` either compiles or it doesn't.
 *
 * Conventions:
 *
 * - Sections mirror the app's screens, plus `common` for words that genuinely
 *   repeat and `date` / `units` / `task` for the shared vocabulary.
 * - Anything with a number, a name or a plural in it is a **function**, so each
 *   language writes its own agreement rules instead of interpolating into a
 *   sentence shape English happened to have.
 * - Strings stay verbatim from SPEC/design, curly apostrophes and all.
 * - Screen anchors ([4a], [7c]) point at `design/Hearth.dc.html`.
 */
import {
	dayOfMonth,
	daysBetween,
	formatDayStamp,
	formatMonthName,
	formatMonthRange,
	formatShortDate,
	formatWeekday,
	formatWeekdayLong,
	formatWeekdayShort,
	needsYear,
	type CalendarDate
} from '$lib/utils/dates';
import { formatAmount, formatIngredient } from '$lib/utils/ingredients';
import { formatQuantity, type UnitLabels } from '$lib/utils/shopping';
import type { RecurUnit } from '$lib/utils/tasks';

/**
 * A sentence with an emphasised run inside it. Expressed as parts rather than
 * as markup in a string, because `{@html}` on translated copy is a standing
 * invitation to inject something, and because where the emphasis falls is a
 * translator's decision — German puts it in a different place than English as
 * often as not.
 */
export type RichText = readonly { text: string; strong?: boolean }[];

/** Bound into every date wrapper below, so a screen never passes a language. */
const L = 'en';

/**
 * Units are stored canonically ('pcs', 'tbsp') and shown per language, so
 * switching language re-labels the list rather than rewriting it. Anything a
 * member typed that isn't in the table shows exactly as typed.
 */
const UNITS: UnitLabels = {
	pcs: 'pcs',
	g: 'g',
	kg: 'kg',
	ml: 'ml',
	L: 'L',
	pack: 'pack',
	tbsp: 'tbsp',
	tsp: 'tsp'
};

export const en = {
	/* ── The document itself ───────────────────────────────────────────────── */
	meta: {
		/** `<meta name="description">`, set in the root layout (→ app.html). */
		description:
			'Every chore, organized. A shared household app for shopping, meal planning and chores.'
	},

	/* ── Words that repeat everywhere ──────────────────────────────────────── */
	common: {
		saveChanges: 'Save changes',
		cancel: 'Cancel',
		edit: 'Edit',
		backToHome: 'Back to home',
		anyone: 'Anyone',
		name: 'Name',
		appName: 'Choreganized',
		/** Browser tab: "Tasks · Choreganized". */
		pageTitle: (screen: string) => `${screen} · Choreganized`
	},

	/* ── The kit's own words ───────────────────────────────────────────────── */
	/*
	 * `lib/components/ui` takes its copy from props, so this is only the handful
	 * of labels a component supplies itself — mostly the ones nobody sees until
	 * they're read out.
	 */
	ui: {
		/** BottomSheet's × [3a], and CenterModal's. */
		close: 'Close',
		/** Banner's optional dismiss × [4a]. */
		dismiss: 'Dismiss',
		search: 'Search',
		clearSearch: 'Clear search',
		/** Stepper's − and + [3a] — the label reads "Decrease quantity". */
		decrease: (label: string) => `Decrease ${label.toLowerCase()}`,
		increase: (label: string) => `Increase ${label.toLowerCase()}`,
		/** ColorPicker [5c]: the palette, and why a swatch is greyed out. */
		yourColour: 'Your colour',
		colours: {
			sage: 'Sage',
			terracotta: 'Terracotta',
			blue: 'Blue',
			amber: 'Amber',
			plum: 'Plum'
		},
		colourTaken: (colour: string) => `${colour} — already taken`
	},

	/* ── The tab bar [02] ──────────────────────────────────────────────────── */
	nav: {
		home: 'Home',
		shopping: 'Shopping',
		tasks: 'Tasks',
		cooking: 'Cooking',
		/** The tab bar itself, for a screen reader's landmark list. */
		sections: 'Sections',
		/** The Tasks tab's overdue badge, read out rather than seen. */
		overdueBadge: (count: number) => `${count} overdue`,
		/** SubHeader's chevron, when a screen doesn't name where it goes back to. */
		back: 'Back'
	},

	/* ── Dates ─────────────────────────────────────────────────────────────── */
	/*
	 * The formatters, bound to this language. `$lib/utils/dates` owns the
	 * calendar arithmetic and asks `Intl` for month and weekday names; what lives
	 * here is the handful of formats that mix a date with words of our own — and
	 * those differ far enough between languages ("in 2 days" vs "in 2 Tagen",
	 * "3 days overdue" vs "seit 3 Tagen überfällig") that each writes its own
	 * rather than filling in a shape English chose.
	 */
	date: {
		/** "Jul 14" — the design's date shorthand [3b] [4b] [4d]. */
		short: (date: CalendarDate, withYear = false) => formatShortDate(date, L, withYear),
		/** The same, carrying its year only once it isn't this one. */
		shortAuto: (date: CalendarDate, today: CalendarDate) =>
			formatShortDate(date, L, needsYear(date, today)),
		/** "Sat" [4a]. */
		weekday: (date: CalendarDate) => formatWeekday(date, L),
		/** "MON" — the Cooking tab's day strip [04]. */
		weekdayShort: (date: CalendarDate) => formatWeekdayShort(date, L),
		/** "Thursday" — the plan-a-meal sheet's title [3d]. */
		weekdayLong: (date: CalendarDate) => formatWeekdayLong(date, L),
		/** "14" — the strip's number [04]. */
		dayOfMonth: (date: CalendarDate) => dayOfMonth(date),
		/** "July", or "Jun – Jul" across the turn of a month [04]. */
		monthRange: (from: CalendarDate, to: CalendarDate) => formatMonthRange(from, to, L),
		/** "June" / "June 2025" — what "load more" would reveal [8a]. */
		monthName: (date: CalendarDate, today: CalendarDate) => formatMonthName(date, today, L),

		/** How the history feed heads a day: "Today", "Yesterday", "Mon 14 Jul" [8a]. */
		dayLabel: (date: CalendarDate, today: CalendarDate) => {
			const days = daysBetween(today, date);
			if (days === 0) return 'Today';
			if (days === -1) return 'Yesterday';
			return formatDayStamp(date, L, needsYear(date, today));
		},

		/**
		 * The due half of a task's meta line (→ SPEC §5.1): "due today", "due
		 * tomorrow", "in 2 days", "3 days overdue", "Sat", "Jul 14".
		 *
		 * [4a] draws both "in 2 days" (due in two) and "Sat" (due in four), so the
		 * switch from counting days to naming the day sits between them; past a
		 * week a weekday name stops being unambiguous and the date takes over.
		 */
		dueMeta: (dueDate: CalendarDate, today: CalendarDate) => {
			const days = daysBetween(today, dueDate);
			if (days < 0) return days === -1 ? '1 day overdue' : `${-days} days overdue`;
			if (days === 0) return 'due today';
			if (days === 1) return 'due tomorrow';
			if (days <= 3) return `in ${days} days`;
			if (days <= 6) return formatWeekday(dueDate, L);
			return formatShortDate(dueDate, L, needsYear(dueDate, today));
		},

		/**
		 * A date the way a picker labels it — "Today · Jul 17", "Sat · Jul 19",
		 * "Jul 24" [3b] [4c]. Same near/far split as `dueMeta`, but always
		 * carrying the date itself: this labels a value you are choosing, where
		 * "in 2 days" alone would leave you counting.
		 */
		dateLabel: (date: CalendarDate, today: CalendarDate) => {
			const days = daysBetween(today, date);
			const short = formatShortDate(date, L, needsYear(date, today));
			if (days === 0) return `Today · ${short}`;
			if (days === 1) return `Tomorrow · ${short}`;
			if (days === -1) return `Yesterday · ${short}`;
			if (days > 1 && days <= 6) return `${formatWeekday(date, L)} · ${short}`;
			return short;
		}
	},

	/* ── Units and amounts ─────────────────────────────────────────────────── */
	units: {
		/** The dropdown in [3a], in the order it offers them. */
		labels: UNITS,
		/** "×6", "2 L" — the shopping row's badge [3a]. */
		quantity: (quantity: number | null, unit: string | null) =>
			formatQuantity(quantity, unit, UNITS),
		/** "250 g" — the recipe's right-hand column [7a]. */
		amount: (quantity: number | null, unit: string | null) => formatAmount(quantity, unit, UNITS),
		/** "250 g mushrooms" — one stored ingredient as an editable line [3c]. */
		ingredient: (row: { quantity: number | null; unit: string | null; name: string }) =>
			formatIngredient(row, UNITS)
	},

	/* ── Task vocabulary ───────────────────────────────────────────────────── */
	/*
	 * The words for the values in `$lib/utils/tasks` — that module keeps the
	 * numbers (5/10/20/40 points, every-2-weeks), this keeps their names.
	 */
	task: {
		/** Effort → points [3b], the canonical four (→ DECISIONS #2). */
		efforts: {
			small: 'Small',
			medium: 'Medium',
			large: 'Large',
			huge: 'Very large'
		},
		/** The Repeat dropdown's fixed choices (→ SPEC §5.2). */
		repeats: {
			none: 'One-off',
			'day-1': 'Every day',
			'week-1': 'Every week',
			'week-2': 'Every 2 weeks',
			'month-1': 'Every month'
		},
		/** The row that reveals the count + unit pair. */
		repeatCustom: 'Custom…',
		/** The custom row's unit dropdown — plural, because a count reads before it. */
		customUnits: {
			day: 'days',
			week: 'weeks',
			month: 'months'
		},
		/** Snooze presets [4c], counted from today (→ SPEC §5.5). */
		snoozes: {
			tomorrow: 'Tomorrow',
			days3: 'In 3 days',
			week1: 'In 1 week',
			weeks2: 'In 2 weeks'
		},
		/** Popular starters [7f] — the name a tap writes into the database. */
		starters: {
			bins: 'Take out the bins',
			bedsheets: 'Change the bedsheets',
			bathroom: 'Clean the bathroom'
		},

		/**
		 * The repeat half of a task's meta line: "One-off", "Weekly", "Every 2
		 * weeks", "Monthly" [05] [4a]. The three every-one cadences get their own
		 * word because that's what the design writes; everything else counts.
		 */
		repeat: (unit: RecurUnit, interval: number) => {
			if (unit === 'none') return 'One-off';
			if (interval === 1) return unit === 'day' ? 'Daily' : unit === 'week' ? 'Weekly' : 'Monthly';
			return `Every ${interval} ${unit}s`;
		},

		/** "+10" — a task's worth, wherever points are a badge. */
		points: (points: number) => `+${points}`,

		/**
		 * The overdue card's footer, left half: "It's Elisabeth's turn" [4a]. An
		 * unassigned task belongs to whoever gets there first, which is worth
		 * saying out loud on the one card that's shouting.
		 */
		turn: (assigneeName: string | null, isMine: boolean) => {
			if (!assigneeName) return 'Anyone can pick this up';
			return isMine ? "It's your turn" : `It's ${assigneeName}'s turn`;
		},

		/** The same as a label rather than a sentence: "Lukas's turn" [4b] [4d]. */
		turnLabel: (assigneeName: string | null, isMine: boolean) => {
			if (!assigneeName) return 'Anyone';
			return isMine ? 'Your turn' : `${assigneeName}'s turn`;
		},

		/**
		 * "reminded yesterday & this morning" [4a], built from the two flag
		 * columns — whatever is set, in the order the nudges go out, and nothing
		 * at all when neither has fired (→ SPEC §5.6).
		 */
		reminderNote: (sentOn: (CalendarDate | null)[], today: CalendarDate) => {
			const phrases: string[] = [];

			for (const date of sentOn) {
				if (!date) continue;
				// The nudges go out at 08:00 household-local, so today's is this
				// morning's.
				const days = daysBetween(today, date);
				const phrase =
					days === 0 ? 'this morning' : days === -1 ? 'yesterday' : formatShortDate(date, L);
				// Both nudges can land on the same morning after downtime; say it once.
				if (!phrases.includes(phrase)) phrases.push(phrase);
			}

			return phrases.length ? `reminded ${phrases.join(' & ')}` : null;
		}
	},

	/* ── Shopping [03] [3a] [7d] [7g] ──────────────────────────────────────── */
	shopping: {
		title: 'Shopping',
		progress: (checked: number, total: number) => `${checked} of ${total} done`,
		manageStores: 'Manage stores',
		/** The group items with no store fall into — also the fallback in copy. */
		other: 'Other',

		empty: {
			title: 'Nothing to buy yet',
			copy: "Add items as you run out — they'll be grouped by store for whoever does the shopping.",
			cta: 'Add first item'
		},

		/** The field pinned above the list [03] [7d]. */
		quickAdd: {
			placeholder: 'Add an item…',
			label: 'Add an item',
			expand: 'Add with quantity and store',
			submit: 'Add item'
		},

		/**
		 * The names the add field completes from — everything this household has
		 * put on the list before (→ SPEC §3.1). The options are household
		 * content, so all this needs is a name for the list they sit in.
		 */
		suggestions: {
			label: 'Suggestions'
		},

		/** The second list, under the stores: what's already in the basket. */
		bought: {
			/** The section heads itself and says how much is in it, like a tab. */
			heading: (count: number) => `Recently bought · ${count}`
		},

		row: {
			check: (item: string) => `Check off ${item}`,
			uncheck: (item: string) => `Put ${item} back on the list`,
			edit: (item: string) => `Edit ${item}`
		},

		/**
		 * The few seconds after a tick, above the tab bar (→ SPEC §3.1). Parts,
		 * not a string, so the name is the bold run and each language decides
		 * where the emphasis falls — English leads with it, another might not.
		 */
		undo: {
			checked: (item: string): RichText => [{ text: item, strong: true }, { text: ' checked off' }],
			action: 'Undo'
		},

		/** Add / edit item [3a]. */
		sheet: {
			add: 'Add item',
			edit: 'Edit item',
			name: 'Item',
			namePlaceholder: 'Sourdough bread',
			quantity: 'Quantity',
			unit: 'Unit',
			/** A taste of the dropdown, under the field. */
			unitHint: 'pcs · g · kg · ml · L …',
			store: 'Store',
			/** The CTA names where the item is going. */
			addTo: (store: string) => `Add to ${store} list`,
			addToList: 'Add to the list',
			delete: 'Delete item'
		},

		/** Manage stores [7g] — the walking order the list follows. */
		stores: {
			title: 'Stores',
			subtitle: 'Group your shopping list by shop',
			back: 'Back to shopping',
			add: 'Add a store',
			addButton: 'Add',
			items: (count: number) => (count === 1 ? '1 item' : `${count} items`),
			rename: (store: string) => `Rename ${store}`,
			moveUp: (store: string) => `Move ${store} up`,
			moveDown: (store: string) => `Move ${store} down`,
			remove: (store: string) => `Delete ${store}`,
			help: 'Use the arrows to reorder — your list follows this order, so arrange it the way you walk through town. Quick-added items land in the first store; items without a store go under “Other”.',
			deleteLabel: 'Delete store',
			deleteConfirm: (store: string) => `Delete ${store}?`,
			deleteMoves: (count: number) =>
				count === 1
					? 'Its 1 item moves to “Other” — nothing falls off the list.'
					: `Its ${count} items move to “Other” — nothing falls off the list.`,
			deleteEmpty: 'Nothing is filed under it, so nothing else changes.',
			/**
			 * The three stores a new household starts with (→ SPEC §3.4). Written
			 * into the database when the household is created, in whatever language
			 * the person creating it was reading — theirs to rename afterwards.
			 */
			defaults: {
				grocery: 'Grocery',
				drugstore: 'Drugstore',
				hardware: 'Hardware store'
			}
		}
	},

	/* ── Home [8b] ─────────────────────────────────────────────────────────── */
	home: {
		title: 'Home',
		/**
		 * The header, above the member's name (→ SPEC §2).
		 *
		 * The `: string` matters: a function whose branches are all literals infers
		 * a literal *union*, and `de.ts` would then have to return the English
		 * words to type-check. Annotate any message function that never
		 * interpolates.
		 */
		greeting: (time: 'morning' | 'afternoon' | 'evening'): string =>
			time === 'morning'
				? 'Good morning'
				: time === 'afternoon'
					? 'Good afternoon'
					: 'Good evening',
		/** The avatar stack is the door to Settings — and the only place the
		 *  household is named out loud. */
		settingsLink: (names: string) => `Settings · Household: ${names}`,

		overdue: {
			count: (count: number) => (count === 1 ? '1 task overdue' : `${count} tasks overdue`),
			/** The oldest one by name, and whether it is this member's [4e]. */
			detail: (task: string, mine: boolean) => (mine ? `${task} · your turn` : task),
			view: 'View'
		},

		/** The two counts [8b]; each reads *after* its number. */
		stats: {
			shopping: 'on shopping list',
			tasksDue: (count: number): string => (count === 1 ? 'task due today' : 'tasks due today')
		},

		dinner: {
			eyebrow: 'Tonight’s dinner',
			cooking: (cook: string) => `${cook} is cooking`,
			add: 'Add tonight’s dinner'
		},

		activity: {
			title: 'Recent activity',
			/** The whole card links to History; this is the affordance. */
			all: 'All'
		},

		/** Where you stand this month — one line, no scoreboard. */
		standings: {
			tied: 'You’re tied this month',
			rank: (rank: number) => {
				const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
				return `You’re ${ordinals[rank - 1] ?? `${rank}th`} this month`;
			},
			each: (points: number) => `${points} pts each`,
			solo: (points: number) => `${points} pts this month`,
			ahead: (points: number, gap: number, rival: string) =>
				`${points} pts · ${gap} ahead of ${rival}`,
			behind: (points: number, gap: number, rival: string) =>
				`${points} pts · ${gap} behind ${rival}`
		}
	},

	/* ── Tasks [4a] [4b] [4c] [4d] ─────────────────────────────────────────── */
	tasks: {
		title: 'Tasks',
		/** The FAB [4a]; the sheet it opens titles itself. */
		newTask: 'New task',

		/**
		 * The list's five moods [4a]. Keyed by `TaskSectionKey`, which is all the
		 * server sends — a heading is copy, not data.
		 */
		sections: {
			overdue: 'Overdue',
			today: 'Today',
			upcoming: 'Upcoming',
			paused: 'Paused',
			undated: 'No date'
		},

		/** The segmented control above the list. */
		view: {
			label: 'Task view',
			todo: (count: number) => `To do · ${count}`,
			history: 'History'
		},

		/** One per housemate on holiday [4a] — an info banner, never a warning. */
		awayBanner: {
			mine: (until: string) => `You're away until ${until}`,
			other: (name: string, until: string) => `${name} is away until ${until}`,
			detailMine: 'Your tasks are paused — nothing counts as overdue',
			detailOther: 'Their tasks are paused — nothing counts as overdue'
		},

		/** The brand-new household [7f]. */
		empty: {
			title: 'No tasks yet',
			copy: 'Add the chores you both forget — earn points when you tick them off. Start with a few?',
			starters: 'Popular starters',
			custom: 'Create a custom task'
		},

		/** The row [05] [4a]. */
		row: {
			/** The meta line's second half when the assignee is on holiday. */
			pausedUntil: (until: string) => `paused until ${until}`,
			/** An undated one-off has only its provenance to offer [05]. */
			addedBy: (name: string) => `added by ${name}`,
			/** The tick's label — it says what it will do, and to whose chore. */
			markDone: (task: string) => `Mark ${task} done`,
			markDoneFor: (task: string, assignee: string) => `Mark ${task} done — it's ${assignee}'s`,
			/** The rest of the card opens the detail sheet [4b]. */
			open: (task: string) => `Open ${task}`
		},

		/** The detail sheet [4b]. */
		detail: {
			wasDue: (date: string) => `was due ${date}`,
			pts: (points: number) => `${points} pts`,
			pausedNote: (name: string, until: string) =>
				`${name} is away until ${until} — this one is paused, not overdue.`,
			markAsDone: (points: number) => `Mark as done · +${points}`,
			snooze: 'Snooze / reschedule',
			/** The roster, minus whoever has it (→ SPEC §5.3). */
			assignTo: (name: string) => `Assign to ${name}`,
			reassignTo: (name: string) => `Reassign to ${name}`,
			/** How the current member appears in those two rows. */
			me: 'me',
			skip: 'Skip this time',
			skipNote: '· no points',
			edit: 'Edit task',
			delete: 'Delete task',
			deleteConfirm: (task: string) => `Delete ${task}?`,
			deleteCopy:
				'It stops coming round. Everything already ticked off stays in history — the points stay with the house.'
		},

		/** The celebration [4d]. */
		done: {
			label: 'Task completed',
			niceWork: (name: string) => `Nice work, ${name}!`,
			logged: (task: string) => `${task} · logged to history`,
			points: (points: number) => `+${points} points`,
			nextDue: (date: string) => `Next due ${date}`,
			/** Where the chore went next — or the truth, when nothing changed hands. */
			handoverAnyone: 'Rescheduled · anyone can take it',
			handoverNext: (name: string) => `Rescheduled · ${name}'s turn next`,
			handoverSame: (name: string) => `Rescheduled · still ${name}'s`,
			/** The month's standings, in one line (→ SPEC §5.4). */
			standingsSolo: (points: number) => `${points} points this month`,
			standingsLeading: (mine: number, theirs: number) => `You're now leading ${mine} – ${theirs}`,
			standingsTied: (mine: number, theirs: number) => `You're level at ${mine} – ${theirs}`,
			standingsBehind: (name: string, theirs: number, mine: number) =>
				`${name} leads ${theirs} – ${mine}`,
			undo: 'Undo',
			undoFailed: 'Couldn’t undo that one.'
		},

		/** Snooze / reschedule [4c]. */
		snooze: {
			title: 'Snooze until…',
			orPick: 'Or pick a date',
			to: (date: string) => `Snooze to ${date}`,
			needsDate: 'Pick a date to snooze to.'
		},

		/** New / edit [3b]. */
		form: {
			new: 'New task',
			edit: 'Edit task',
			name: 'Task',
			namePlaceholder: 'Clean the bathroom',
			assignTo: 'Assign to',
			alternate: 'Alternate each time',
			/** "Lukas → Elisabeth → Lukas …" — the rotation, shown rather than promised. */
			rotation: (names: string[]) => `${names.join(' → ')} …`,
			repeat: 'Repeat',
			every: 'Every',
			unit: 'Unit',
			firstDue: 'First due',
			nextDue: 'Next due',
			dueShortcuts: 'Due date shortcuts',
			today: 'Today',
			tomorrow: 'Tomorrow',
			noDate: 'No date',
			effort: 'Effort → points',
			create: 'Create task'
		},

		/** The month's standings [8a] and the tiles under the list [05]. */
		podium: {
			thisMonth: 'This month',
			resets: (date: string) => `resets ${date}`,
			/** The list is in rank order, which is what a screen reader reads out. */
			standings: 'Standings, best first'
		},

		/** The full feed [8a]. */
		historyScreen: {
			emptyTitle: 'Nothing done yet',
			emptyCopy:
				'Tick a task off and it lands here — what it was, who did it, and what it was worth.',
			backToList: 'Back to the list',
			/** A month somebody paged into that turned out to hold nothing. */
			emptyStretch: 'Nothing was completed in this stretch.',
			showMonth: (month: string) => `Show ${month}`
		},

		/** The history block under the to-do list [05]. */
		history: {
			recent: 'Recent history',
			/*
			 * The real job of the block: a recurring task that vanished from To do
			 * isn't gone, it has a next date. The no-break space keeps "To do" whole.
			 */
			explainer:
				'Completed tasks are logged here. Recurring ones reappear in To\u00A0do on their next date.'
		}
	},

	/* ── Cooking [04] [3d] [7a] ────────────────────────────────────────────── */
	cooking: {
		title: 'Cooking',
		/** "35 min", or nothing when a recipe never said how long it takes. */
		cookTime: (minutes: number) => `${minutes} min`,
		/** "Serves 4" — the recipe header and the share text. */
		serves: (servings: number) => `Serves ${servings}`,

		/**
		 * Which week the plan is showing [04], and the day picker's groups [7a].
		 *
		 * `weekSwitch` rather than `weeks`: `week` below is the row copy, and one
		 * character between two neighbouring keys — in a file read side by side
		 * with its German twin — is a permanent misread waiting to happen.
		 */
		weekSwitch: {
			/** Names the two-way switch for a screen reader. */
			label: 'Which week',
			current: 'This week',
			next: 'Next week',
			/** On the switch, carrying how many of the seven days have a dinner. */
			currentCount: (planned: number) => `This week · ${planned}`,
			nextCount: (planned: number) => `Next week · ${planned}`
		},

		/** The week's rows [04]. */
		week: {
			tonight: 'Tonight',
			tonightWith: (cook: string) => `Tonight · ${cook}`,
			cooks: (cook: string) => `${cook} cooks`,
			addMeal: 'Add a meal',
			/** Seven identical buttons would otherwise be read out alike. */
			addMealOn: (weekday: string, day: string) => `Add a meal on ${weekday} ${day}`,
			changeMeal: (weekday: string) => `Change ${weekday}’s meal`,
			/** Read out beside today's column in the strip. */
			today: '(today)'
		},

		/** The library block under the week [04]. */
		library: {
			title: 'Recipe library',
			browseAll: (count: number) => `Browse all · ${count}`,
			recentlyAdded: 'Recently added',
			addedOn: (date: string) => `added ${date}`,
			firstTitle: 'Save your first recipe',
			firstSub: 'Then drop it onto any day of the week in a tap.'
		},

		/** "Which day?" [7a] — asked before the plan sheet can open. */
		dayPicker: {
			title: 'Which day?',
			eyebrow: 'Add to plan',
			free: 'Free',
			/** The row read out: "Thursday 17 — free". */
			day: (weekday: string, day: string, meal: string) => `${weekday} ${day} — ${meal}`,
			freeQuiet: 'free'
		},

		/** Plan a meal [3d]. */
		plan: {
			eyebrow: 'Plan a meal',
			searchRecipes: 'Search your recipes',
			/** The radio group of recipes, named for a screen reader. */
			recipeGroup: 'Recipe',
			noMatch: 'No recipe by that name — cook something not saved instead?',
			moreMatches: (count: number) => `${count} more match — keep typing to narrow it down.`,
			mostRecent: (rest: number) => `Your most recent — search to reach the other ${rest}.`,
			notSaved: 'Cook something not saved',
			notSavedPlaceholder: 'Pizza night',
			cooking: 'Who’s cooking?',
			optional: 'optional',
			addIngredients: 'Add ingredients to shopping list',
			addTo: (weekday: string) => `Add to ${weekday}`,
			remove: 'Remove meal'
		},

		/** Browse all recipes, and [7e] when there is nothing in it yet. */
		recipes: {
			title: 'Recipes',
			saved: (count: number) => (count === 1 ? '1 saved' : `${count} saved`),
			back: 'Back to the week',
			search: 'Search recipes',
			emptyTitle: 'Build your cookbook',
			emptyCopy: 'Save the meals you cook often. Then drop them onto any day of the week in a tap.',
			emptyCta: 'Add a recipe',
			noMatch: (query: string) => `Nothing matches “${query}”.`,
			newRecipe: 'New recipe'
		},

		/** The "Add a recipe" chooser [plan 14] the New button opens — one door to
		 *  the four ways in: a link, a photo, pasted text, or by hand. */
		add: {
			title: 'Add a recipe',
			link: 'From a link',
			linkSub: 'Paste a recipe URL',
			photo: 'From a photo',
			photoSub: 'Snap a cookbook or magazine page',
			text: 'Paste text',
			textSub: 'Paste the recipe text',
			manual: 'Enter by hand',
			manualSub: 'Type it in yourself',
			/** The small tag on the two AI-powered options. */
			aiTag: 'AI',
			/** Subtitle on the AI options when no key is set — they lead to Settings. */
			needsSetup: 'Set up AI import first'
		},

		/** One recipe [7a]. */
		recipe: {
			back: 'Back to recipes',
			options: 'Recipe options',
			addedBy: (name: string) => `Added by ${name}`,
			addToPlan: 'Add to plan',
			addAllToList: 'Add all ingredients to the shopping list',
			addAll: 'Add all to list',
			ingredients: 'Ingredients',
			steps: 'Steps',
			startCookMode: 'Start cook mode',
			/** Split so the middle run can be the link to the edit screen. */
			noStepsLead: 'No steps written down yet — ',
			noStepsLink: 'add them',
			noStepsRest: ' and cook mode can walk you through it.'
		},

		/** The ••• menu [7c]. */
		menu: {
			edit: 'Edit recipe',
			duplicate: 'Duplicate',
			share: 'Share',
			copy: 'Copy recipe',
			copied: 'Copied to clipboard',
			delete: 'Delete recipe',
			deleteConfirm: (name: string) => `Delete ${name}?`,
			deleteCopy:
				'Its ingredients and steps go with it. Days you already planned it on keep the name.',
			keep: 'Keep it'
		},

		/** New / edit recipe [3c]. */
		form: {
			new: 'New recipe',
			edit: 'Edit recipe',
			editTitle: (name: string) => `Edit ${name}`,
			photo: 'Recipe photo',
			changePhoto: 'Change photo',
			addPhoto: 'Add a photo',
			removePhoto: 'Remove photo',
			name: 'Recipe name',
			namePlaceholder: 'Creamy mushroom pasta',
			time: 'Time (min)',
			servingsLabel: 'Servings',
			ingredients: 'Ingredients',
			ingredientPlaceholder: '400 g pasta',
			ingredientLabel: (index: number) => `Ingredient ${index}`,
			addIngredient: 'Add ingredient',
			/**
			 * The parser still reads the line; this says so, lists what it knows,
			 * and points at the sheet for the times it reads a line wrong.
			 */
			ingredientsNote: (units: string) =>
				`Write them however you like — “400 g pasta”, “2 eggs”, “salt”. Units we know: ${units}. Tap an amount to set the number and unit yourself.`,
			/**
			 * The chip beside each row. No row number: the input beside it already
			 * announces "Ingredient 3", and this is its description.
			 */
			amountLabel: (amount: string) => (amount ? `${amount} — edit` : 'No amount — add one'),
			/** The row taken apart [3c], with [3a]'s unit list. */
			ingredientNamePlaceholder: 'pasta',
			quantity: 'Amount',
			quantityPlaceholder: '400',
			unit: 'Unit',
			/**
			 * Salt is not measured in pieces, so "none" has to be offered — [3a]
			 * has no such option because `pcs` is its default.
			 */
			unitNone: 'No unit',
			/** A unit measures a quantity (→ DECISIONS #42), so it waits for one. */
			unitHint: 'Only saved with an amount',
			/** What the composed line will actually be read as (→ DECISIONS #101). */
			savedAsLead: 'Saved as ',
			savedAsNothing: 'nothing yet',
			/** Writes the three fields back into the row's line; nothing is saved yet. */
			amountDone: 'Done',
			steps: 'Steps',
			stepPlaceholder: 'Boil the pasta until al dente, about 9 min.',
			stepLabel: (index: number) => `Step ${index}`,
			addStep: 'Add step',
			save: 'Save',
			saveRecipe: 'Save recipe',
			/** The reorder/remove controls beside each row. */
			moveIngredientUp: (index: number) => `Move ingredient ${index} up`,
			moveIngredientDown: (index: number) => `Move ingredient ${index} down`,
			removeIngredient: (index: number) => `Remove ingredient ${index}`,
			moveStepUp: (index: number) => `Move step ${index} up`,
			moveStepDown: (index: number) => `Move step ${index} down`,
			removeStep: (index: number) => `Remove step ${index}`
		},

		/** What "add the ingredients to the shopping list" did [04] [7a]. */
		shoppingResult: {
			added: (count: number) =>
				count === 1
					? '1 ingredient on the shopping list'
					: `${count} ingredients on the shopping list`,
			nothing: 'Everything is already on the list',
			skipped: (count: number) =>
				count === 1 ? '1 was already on it' : `${count} were already on it`,
			openList: 'Open list'
		},

		/** Cook mode [7b] [7h] (→ SPEC §4.6). */
		cook: {
			title: (recipe: string) => `Cook · ${recipe}`,
			setTimer: 'Set a timer',
			close: 'Close cook mode',
			step: (index: number, total: number) => `Step ${index} of ${total}`,
			startTimer: 'Set timer',
			startParsedTimer: (duration: string) => `Start ${duration} timer`,
			ingredients: 'Ingredients',
			/** "This step uses **250 g mushrooms**" — the bold is the list. */
			usesLead: 'This step uses ',
			previous: 'Previous step',
			next: 'Next step',
			finish: 'Finish',
			eyebrow: 'Cook mode',
			noSteps:
				'This recipe has no steps written down yet — add them and cook mode can walk you through it.',
			addSteps: 'Add the steps',

			/** The ingredients peek [7b]. */
			peekTitle: 'Ingredients',
			peekTitleServes: (servings: number) => `Ingredients · serves ${servings}`,
			peekEmpty: 'This recipe doesn’t list any ingredients.',

			/** The manual timer sheet (→ DECISIONS #14). */
			timerTitle: 'Set a timer',
			timerSubtitle: 'It rings even with the phone locked.',
			minutes: 'Minutes',
			startMinutes: (minutes: number) => `Start ${minutes}-minute timer`,

			/** The running ring [7h] and the chip it shrinks to. */
			timerLabel: (label: string, state: string) => `${label}: ${state}`,
			timerDone: 'done',
			timerLeft: (remaining: string, total: string) => `${remaining} left of ${total}`,
			timerMeta: (label: string, total: string, paused: boolean) =>
				paused ? `${label} · ${total} · paused` : `${label} · ${total}`,
			dismiss: 'Dismiss',
			resume: 'Resume',
			pause: 'Pause',
			addMinute: '+1:00',
			cancel: 'Cancel',
			paused: '(paused)',
			barDone: (label: string) => `${label} is done`,
			barRunning: (label: string, remaining: string) => `${label}, ${remaining} left`,
			barBackTo: (step: number) => ` — back to step ${step}`,
			/** The default label a timer with no step text gets. */
			defaultTimer: 'Timer',
			/** Three identical "Timer"s is one timer. Fall back to where it was set. */
			timerForStep: (step: number) => `Step ${step} timer`,
			/** The × on a bar: a timer you aren't standing on, stopped where it is. */
			timerCancelOne: (label: string) => `Cancel ${label}`,
			/** At the cap the Start chip stands down and says why (→ DECISIONS #102). */
			timerCapped: (max: number) =>
				`${max} timers at once is the limit — stop one before you start another.`,
			/** No service worker, so the alarm can only fire while this tab lives. */
			offline: 'Offline — this one will only ring while the app is open.',
			timerFailed: "That timer wouldn't start."
		},

		/**
		 * The running-timer dock [7h] — the one row a timer shrinks to once you
		 * leave cook mode. Under `cooking` because that is what it is about, even
		 * though it shows up on every other tab (→ DECISIONS #104).
		 */
		dock: {
			running: (label: string, remaining: string) => `${label}, ${remaining} left`,
			done: (label: string) => `${label} is done`,
			/** Always said, so it is clear the row goes somewhere. */
			backTo: ' — back to cooking',
			/** "+2" beside the soonest, when more than one is running. */
			more: (count: number) => `+${count}`,
			/** The same count, spelled out for the row's label. */
			andMore: (count: number) => (count === 1 ? ' and 1 more timer' : ` and ${count} more timers`),
			dismiss: 'Dismiss this timer'
		},

		/** Import a recipe from a link [3c as the preview] (→ SPEC §4.7, plan 12). */
		import: {
			title: 'Import a recipe',
			subtitle: 'From a link',
			back: 'Back to recipes',
			/** The one line under the header that says what to paste. */
			intro:
				'Paste a link to a recipe and we’ll fill in the name, photo, ingredients and steps for you to check.',
			urlLabel: 'Recipe link',
			urlPlaceholder: 'https://…',
			fetch: 'Fetch recipe',
			fetching: 'Fetching…',
			/** The way out by hand, offered under the field and after any failure.
			 *  Split so the middle run can be the link to the blank editor. */
			manualLead: 'No link? ',
			manualLink: 'Enter it by hand',
			manualRest: ' instead.',

			/** The typed fetch failures — one message each (→ server/recipe-import.ts). */
			error: {
				invalidUrl: 'That doesn’t look like a web address — paste the recipe’s link.',
				blocked: 'That link can’t be opened from here. Try the recipe’s public web address.',
				unreachable: 'Couldn’t reach that page — check the link and your connection.',
				notHtml: 'That link isn’t a web page. Paste the recipe’s page, not a file or an image.',
				tooLarge: 'That page is too big to read — try a direct link to the recipe.',
				noRecipe: 'No recipe data on that page.'
			},

			/** The AI fallback [plan 13]: read a page with no recipe data, pasted text,
			 *  or photos. Only offered when a household Gemini key is set (→ SPEC §4.7). */
			ai: {
				note: 'AI-extracted — check it over before saving.',
				pageLead:
					'This page has no recipe data we can read directly. Want to try reading it with AI?',
				tryPage: 'Try AI extraction',
				extracting: 'Extracting…',
				pasteToggle: 'Paste the recipe text instead',
				pasteLabel: 'Recipe text',
				pastePlaceholder: 'Paste the whole recipe — ingredients and steps.',
				pasteSubmit: 'Extract recipe',
				photoToggle: 'Import from a photo',
				photoLabel: 'Photos of the recipe',
				photoHint: 'Up to 3 photos of a cookbook or magazine page.',
				photoSubmit: 'Extract from photos',
				hintLead: 'No recipe data on that page. ',
				hintLink: 'Set up AI import',
				hintRest: ' in Settings to extract it anyway.',
				/** Photo/text mode with no key set — an edge (the chooser routes such
				 *  taps to Settings), but a direct visit or a just-removed key lands here. */
				setupCopy:
					'AI import isn’t set up yet. Add a Google Gemini key to read recipes from photos and pasted text.',
				setupCta: 'Set up AI import',
				error: {
					noKey: 'Set up AI import in Settings first.',
					badKey: 'That Gemini key was refused — check it in Settings.',
					rateLimited: 'The AI service is busy right now — give it a moment and try again.',
					noRecipe: 'Couldn’t find a recipe in that — try clearer photos or more complete text.',
					noPhotos: 'Add at least one photo of the recipe.',
					failed: 'AI extraction didn’t work — give it a moment and try again.'
				}
			}
		}
	},

	/* ── Settings [6a] [6b] [6c] [6d] ──────────────────────────────────────── */
	settings: {
		title: 'Settings',

		/** The five section headings, in the order they stack [6a]. */
		account: 'Account',
		notifications: 'Notifications',
		awayMode: 'Away mode',
		household: 'Household',

		displayName: 'Display name',
		members: 'Members',

		/**
		 * The language row and the sheet behind it (→ SPEC §6).
		 *
		 * "System" is not a language, it's the absence of a choice: it leaves
		 * `members.locale` NULL so each device follows its own `Accept-Language`
		 * (→ hooks.server.ts). The two named options are never translated — a
		 * German speaker looking for German looks for "Deutsch".
		 */
		language: {
			row: 'Language',
			title: 'Language',
			system: 'System',
			systemDetail: (detected: string) => `Follow this device — currently ${detected}`,
			/** The whole document reloads, which is worth saying before it happens. */
			note: 'Changing the language reloads the app.'
		},

		/** The three switches [6a]; the detail says what each one actually sends. */
		prefs: {
			taskReminders: 'Task reminders',
			taskRemindersDetail: 'The morning a task of yours is due',
			overdueNudges: 'Overdue nudges',
			overdueNudgesDetail: 'One nudge the morning after it slipped',
			shoppingUpdates: 'Shopping list updates',
			shoppingUpdatesDetail: 'When a housemate adds to the list'
		},

		/** The round trip that proves push works (→ SPEC §6). */
		test: {
			send: 'Send test notification',
			sending: 'Sending…',
			notConfigured: 'Push isn’t configured on the server yet.',
			noDevice: 'No device is subscribed yet — switch it on above.',
			sentOne: 'Sent to this device — it should arrive in a moment.',
			sentMany: (count: number) => `Sent to ${count} devices — they should arrive in a moment.`
		},

		signOut: 'Sign out',
		signingOut: 'Signing out…',
		signOutFailed: 'Couldn’t sign out — check your connection and try again.',

		/** Your profile [6a]. */
		profile: {
			title: 'Your profile',
			eyebrow: 'Account'
		},

		/** Rename the household [6a] — owner only (→ DECISIONS #10). */
		householdName: {
			title: 'Household name',
			eyebrow: 'Household',
			placeholder: 'Sonnengasse 12',
			note: 'Everyone in the house sees this name.'
		},

		/** AI recipe import [6a] — owner only (→ plan 13, SPEC §4.7). The key is
		 *  stored server-side; this screen only ever sees a masked hint. */
		aiImport: {
			row: 'AI recipe import',
			on: 'On',
			notSet: 'Not set',
			title: 'AI recipe import',
			eyebrow: 'Household',
			what: 'Add a Google Gemini key to pull recipes from photos, pasted text, and pages that have no recipe data.',
			cost: 'Each import costs a fraction of a cent on your own Google account — the free tier usually covers a household.',
			getKey: 'Get a key at Google AI Studio',
			current: (hint: string) => `Current key: ${hint}`,
			keyLabel: 'Gemini API key',
			keyPlaceholder: 'AQ.… or AIza…',
			replace: 'Replace key',
			remove: 'Remove key',
			invalid: 'That doesn’t look like a Gemini key — paste the full key from Google AI Studio.'
		},

		/** Leave household [6d] — three things to say, one confirm (→ SPEC §7). */
		leave: {
			label: 'Leave household',
			blockedTitle: 'Hand over the house first',
			blockedCopy: (household: string) =>
				`You're the owner of ${household}, and someone has to be able to manage members and the invite. Make a housemate the owner, then you can leave.`,
			goToMembers: 'Go to members',
			title: (household: string) => `Leave ${household}?`,
			lastCopy: (household: string) =>
				`You're the only one here, so leaving deletes ${household} for good — the shopping list, the meal plan, every task and all the points logged so far. This can't be undone.`,
			copy: "You'll lose access to the shared shopping list, tasks and meal plan. Your points stay with the household.",
			deleteAndLeave: 'Delete household & leave',
			failed: "That didn't work. Try again."
		},

		/** The roster [6b]. */
		roster: {
			title: 'Members',
			back: 'Back to settings',
			you: '(you)',
			owner: 'Owner',
			joined: (date: string) => `Joined ${date}`,
			memberJoined: (date: string) => `Member · joined ${date}`,
			manage: (name: string) => `Manage ${name}`,
			pendingInvite: 'Pending invite',
			noInvite: 'No invite is live',
			code: (code: string) => `Code ${code}`,
			nobodyCanJoin: 'Nobody can join with a code',
			revoke: 'Revoke',
			newCode: 'New code',
			invite: 'Invite housemate',
			helpOwner:
				'As the owner you can change roles or remove members. Everyone else can view this list and leave on their own.',
			helpMember:
				'The owner changes roles and removes members. You can invite housemates, and leave on your own from Settings.'
		},

		/** Manage a housemate [6c] — the owner's two irreversible decisions. */
		manage: {
			meta: (joined: string, points: number) =>
				`Member · joined ${joined} · ${points} pts this month`,
			makeOwner: 'Make owner',
			makeOwnerDetail: 'They’ll also be able to manage members',
			remove: 'Remove from household',
			removeDetail: 'Loses access · points stay with the house',
			removeLabel: 'Remove member',
			removeConfirm: (name: string) => `Remove ${name}?`,
			removeCopy:
				'They lose access to the shopping list, tasks and meal plan straight away. Anything assigned to them becomes Anyone’s, and every point they’ve scored stays with the house.',
			ownerConfirm: (name: string) => `Make ${name} the owner?`,
			ownerCopy:
				'They’ll be able to rename the household, manage the invite and remove members — including you. You stay a member of the house.',
			failed: "That didn't work."
		}
	},

	/* ── Sign in [5a] and onboarding [5b]–[5e] ─────────────────────────────── */
	auth: {
		signIn: 'Sign in',
		/** The wordmark is split so "ganized" can take the accent colour. */
		wordmarkLead: 'Chore',
		wordmarkAccent: 'ganized',
		tagline: 'Every chore, organized',
		continueWithGoogle: 'Continue with Google',
		openingGoogle: 'Opening Google…',
		failed: 'Sign-in didn’t complete. Please try again.',
		footnote: 'New here? Signing in with Google creates your account.',
		/** `/` while the redirect is in flight — a no-JS fallback nobody reads. */
		redirecting: 'Taking you to Choreganized…'
	},

	onboarding: {
		/** "‹ · STEP 1 OF 2" [5c] [5d]. */
		step: (step: number, total: number) => `Step ${step} of ${total}`,
		backToStart: 'Back to the start',

		/** Create or join [5b]. */
		start: {
			title: 'Get started',
			welcome: (name: string) => `Welcome, ${name}`,
			question: 'How would you like to start?',
			createTitle: 'Create a household',
			createCopy: 'Start fresh and invite the people you live with.',
			joinTitle: 'Join a household',
			joinCopy: 'Got an invite link or code? Enter it here.',
			continue: 'Continue'
		},

		/** Set up your home [5c]. */
		create: {
			title: 'Set up your home',
			householdName: 'Household name',
			householdPlaceholder: 'Sonnengasse 12',
			displayName: 'Your display name'
		},

		/** Invite your housemates [5d]. */
		invite: {
			title: 'Invite your housemates',
			/** Two lines in the design; the break is between these. */
			titleLead: 'Invite your',
			titleRest: 'housemates',
			sub: 'They’ll share the shopping list, tasks and meal plan with you.',
			backToMembers: 'Back to members',
			code: 'Invite code',
			copy: 'Copy',
			copied: 'Copied',
			share: 'Share invite',
			/** The OS share sheet's own text. */
			shareText: (household: string) => `Join ${household} on Choreganized`,
			revoked:
				'This household has no active invite code. The owner can make a new one under Settings → Members.',
			members: 'Members',
			waiting: 'Waiting for someone to join…',
			done: 'Done',
			moveIn: 'Move in'
		},

		/** Join a household [5e]. */
		join: {
			title: 'Join a household',
			profileTitle: 'Set up your profile',
			differentCode: 'Enter a different code',
			code: 'Invite code',
			submit: 'Join household',
			badCode: 'That code doesn’t match a household. Check it with whoever invited you.',
			nameTooLong: (max: number) => `Keep your name under ${max} characters.`
		},

		/** The public invite landing, `/j/{code}`. */
		landing: {
			invited: 'You’re invited',
			notFound: 'Invite not found',
			copy: 'You’ll share the shopping list, meal plan and tasks with them. Sign in with Google to join.',
			gone: 'This invite link isn’t valid any more — the code may have been replaced or revoked. Ask your housemate for a fresh one.',
			accept: 'Accept invitation',
			goToSignIn: 'Go to sign in',
			/** The preview card [5e]. */
			invitedBy: 'invited you to',
			invitedTo: 'You’ve been invited to'
		}
	},

	/* ── The two one-time offers on Home [8b] ──────────────────────────────── */
	enablePush: {
		/** The Settings row [6a]. */
		row: 'Enable on this device',
		toggle: 'Enable notifications on this device',
		unavailable: 'Unavailable',
		/** The prompt card on Home — asked once, then never again. */
		promptTitle: 'Turn on notifications',
		promptDetail: 'A nudge the morning a task is due. Nothing else.',
		enable: 'Enable',
		enabling: 'Enabling…',
		notNow: 'Not now',
		/** Why the switch isn't the answer, when there's something to say. */
		unsupported:
			'This browser can’t show notifications. On iPhone, add Choreganized to your home screen first.',
		unconfigured: 'Push isn’t configured on the server yet.',
		denied:
			'Notifications are blocked for Choreganized. Turn them back on in your browser’s site settings.',
		subscribed: 'Task reminders and shopping updates arrive here, even with the app closed.',
		failed: 'Something went wrong.'
	},

	install: {
		title: 'Add to your home screen',
		detail: 'Install Choreganized for one-tap, full-screen access.',
		add: 'Add',
		opening: 'Opening…',
		notNow: 'Not now'
	},

	/* ── Notifications ─────────────────────────────────────────────────────── */
	/*
	 * `title` carries the whole message: it's the bold line, the one that survives
	 * truncation on a lock screen, and the platform already prints the app name
	 * above it (→ DECISIONS #55).
	 *
	 * These are the one place the app speaks to somebody who isn't making the
	 * request, so the language comes from the *recipient's* `members.locale`
	 * rather than from `event.locals` (→ `server/push.ts`).
	 */
	push: {
		/** "🛒 Elisabeth added 3 items to the list" (→ SPEC §3.5). */
		shoppingAdd: (member: string, count: number) =>
			count === 1
				? `🛒 ${member} added 1 item to the list`
				: `🛒 ${member} added ${count} items to the list`,

		/** The two task nudges [4e] (→ SPEC §5.6). */
		taskDue: (emoji: string, task: string, assigned: boolean) =>
			`${emoji} ${task} is due today — ${assigned ? 'your turn' : 'anyone can pick this up'}`,
		taskOverdue: (emoji: string, task: string, assigned: boolean) =>
			`${emoji} ${task} is overdue — ${assigned ? "it's your turn" : 'anyone can pick this up'}`,

		/** "Does this actually work?", answered on the device that asks (→ SPEC §6). */
		testTitle: '🔔 Notifications are on',
		testBody: 'This is what a nudge from Choreganized looks like.',

		/** A cook timer that rang while the phone was locked (→ SPEC §4.6). */
		timerDone: (label: string) => `⏲️ ${label} is done`
	},

	/* ── Refusals ──────────────────────────────────────────────────────────── */
	/*
	 * Everything the server says when it won't do something — inline form errors,
	 * the JSON endpoints' messages (cook mode shows those as-is), and the handful
	 * of `error()` pages a load can raise. Server code reaches them through
	 * `catalog(event.locals.locale)`, so a refusal comes back in the language the
	 * request was made in.
	 */
	errors: {
		/** Shared by every length-capped field. */
		keepUnder: (max: number) => `Keep it under ${max} characters.`,

		/** The API guards (→ `server/guards.ts`) and the uploads endpoint. */
		notSignedIn: 'Not signed in',
		notInHousehold: 'Not in a household',
		notFound: 'Not found',
		bodyTooLarge: 'Body too large',
		expectedJson: 'Expected JSON',
		endpointMustBeHttps: 'Endpoint must be https',

		/** The FK cascaded out from under the request (→ `(app)/+layout.server.ts`). */
		householdMissing: 'Your household record is missing. Please contact support.',

		tasks: {
			name: 'Give the task a name.',
			gone: 'That task has already been dealt with.',
			snoozeDate: 'Pick a date to snooze to.',
			notANotification: "That's not a notification setting."
		},

		shopping: {
			itemName: 'Give the item a name.',
			storeName: 'Give the store a name.'
		},

		recipes: {
			name: 'Give the recipe a name.',
			nameTooLong: (max: number) => `Keep the name under ${max} characters.`,
			gone: 'That recipe is gone.',
			gonePickAnother: 'That recipe is gone. Pick another, or name what you’re cooking.',
			mealDay: 'Pick a day for this meal.',
			mealChoice: 'Pick a recipe, or name what you’re cooking.',
			timerLength: 'That is not a length of time.',
			/** The server's half of the cap — a forged or racing request (→ #102). */
			timerLimit: (max: number) => `${max} timers at once is the limit.`
		},

		/** Photo upload (→ `server/uploads.ts`), all shown on the recipe form. */
		photo: {
			notSaved: 'That photo couldn’t be saved.',
			tooLarge: (megabytes: number) => `That photo is too large — pick one under ${megabytes} MB.`,
			notAnImage: 'That file isn’t an image.',
			unreadable: 'That image couldn’t be read — try a JPEG or PNG.',
			storeFailed: 'Could not store that photo.',
			diskFailed: 'Could not store that photo — the server’s disk rejected it.'
		},

		/** `HouseholdError`, keyed by its own codes (→ `services/household.ts`). */
		household: {
			'color-taken': 'A housemate already has that colour.',
			'not-owner': 'Only the owner can do that.',
			'not-member': 'You’re not a member of this household any more.',
			'transfer-first': 'Make someone else the owner first — a household needs one.',
			'remove-self': 'To leave yourself, use Leave household in Settings.',
			'stale-roster':
				'You’re the only one here now, so leaving would delete the household. Reload and confirm again.'
		},

		/** The two profile fields, wherever they're written. */
		displayName: 'Tell us what to call you.',
		pickColour: 'Pick one of the colours.',
		householdName: 'Give your home a name.',
		colourTakenJoin: 'Someone in the household already has that colour. Pick another.',
		ownerOnlyMembers: 'Only the owner can manage members.',
		alreadyLeft: 'They already left the household.'
	},

	/* ── The holiday pause (→ SPEC §5.5), in [4c] and [6a] ─────────────────── */
	away: {
		title: 'Going away?',
		detail: [
			{ text: 'Pause ' },
			{ text: 'all your tasks', strong: true },
			{
				text: " while you're on holiday — nothing counts as overdue and no reminders are sent."
			}
		] as RichText,
		/** The switch itself, named for a screen reader. */
		toggle: 'Going away',
		backOn: 'Back on',
		/** The CTA under the picker: "Pause my tasks until Jul 24". */
		pauseUntil: (date: string) => `Pause my tasks until ${date}`,
		updateUntil: (date: string) => `Update my tasks until ${date}`
	}
};

export type Messages = typeof en;
