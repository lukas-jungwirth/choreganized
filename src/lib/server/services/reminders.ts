/**
 * Task reminders (→ SPEC §5.6) — "a quiet nudge, never a red-alert storm" [4e].
 *
 * Two pushes per occurrence and no more: one the morning a task is due, one the
 * morning after it slips. After that it just waits, flagged on the list, on
 * Home's banner and on the tab badge, until it's done or snoozed.
 *
 * The whole lifecycle hangs off two columns — `tasks.dueReminderSentAt` and
 * `tasks.overdueReminderSentAt` — which is what lets the sweep keep no memory of
 * its own: whether the tick lands at 08:00 or at 13:45 after an afternoon of
 * downtime, each nudge fires exactly once (→ docs/DATA-MODEL.md "Reminder
 * time-sweep"). `lib/server/cron.ts` owns the minute tick, the household clock
 * and the 08:00 gate; this file answers the household-scoped half — "on this
 * date, who still needs telling?".
 */
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { CalendarDate } from '$lib/utils/dates';
import { db } from '../db';
import { members, tasks } from '../db/schema';
import { sendToUser, type NotificationPref, type PayloadFor } from '../push';
import { isAway } from './tasks';

/** The two nudges of [4e], in the order they go out. */
type ReminderKind = 'due' | 'overdue';

/** What the sweep needs to know about a housemate. */
type Housemate = {
	id: string;
	userId: string;
	awayUntil: CalendarDate | null;
	notifyTaskReminders: boolean;
	notifyOverdueNudges: boolean;
};

/** An occurrence that hasn't had its nudge for `kind` yet. */
type PendingTask = {
	id: string;
	name: string;
	dueDate: CalendarDate;
	assigneeMemberId: string | null;
};

export type ReminderSweep = {
	/** Occurrences nudged about — at most one per task per morning. */
	nudges: number;
	/** Devices that took one; 0 while nobody has enabled push yet. */
	devices: number;
};

/**
 * Which toggle silences a kind of nudge — Settings' "Task reminders" and
 * "Overdue nudges" (→ SPEC §5.6, §6). Pinned to `push.ts`'s union, so renaming
 * a preference column there fails here rather than quietly reading `undefined`
 * off a member and nudging them anyway.
 */
type ReminderPref = Extract<NotificationPref, 'notifyTaskReminders' | 'notifyOverdueNudges'>;

function prefFor(kind: ReminderKind): ReminderPref {
	return kind === 'due' ? 'notifyTaskReminders' : 'notifyOverdueNudges';
}

/**
 * One household's morning sweep. Called by the cron tick once the household's
 * own clock has passed 08:00, every minute after that — and answering "nothing
 * to do" is the normal case, because the flags are set the first time round.
 *
 * @param today the household-local calendar date
 * @param now the instant the flags are stamped with
 */
export async function sendTaskReminders(
	householdId: string,
	today: CalendarDate,
	now: Date = new Date()
): Promise<ReminderSweep> {
	// Asked first, and on most ticks the only question asked: past the morning's
	// first sweep every flag is set, so this comes back empty and there is nobody
	// to look up.
	const pending = pendingReminders(householdId, today);
	if (pending.length === 0) return { nudges: 0, devices: 0 };

	const roster: Housemate[] = db
		.select({
			id: members.id,
			userId: members.userId,
			awayUntil: members.awayUntil,
			notifyTaskReminders: members.notifyTaskReminders,
			notifyOverdueNudges: members.notifyOverdueNudges
		})
		.from(members)
		.where(eq(members.householdId, householdId))
		.orderBy(asc(members.joinedAt), asc(members.id))
		.all();

	// Claim first, send after. Every flag in this loop is written before a single
	// byte leaves the machine — better-sqlite3 is synchronous, so nothing else
	// gets a turn in between — which is what makes a crash mid-sweep cost a
	// notification rather than repeat one every minute for the rest of the day.
	const outbox: { userId: string; payload: PayloadFor }[] = [];
	let nudges = 0;

	for (const task of pending) {
		// The two conditions are mutually exclusive, so an occurrence is only ever
		// one of the two nudges — and never both on the same morning.
		const kind: ReminderKind = task.dueDate === today ? 'due' : 'overdue';

		// The assignee, or — for an "Anyone" task — the whole household
		// (→ SPEC §5.6). An id that no longer names a housemate falls through to
		// "Anyone" for the reason the rest of the app does: the chore is still
		// somebody's problem (→ DECISIONS #12).
		const assignee = roster.find((member) => member.id === task.assigneeMemberId);

		// Holiday pause: a nudge nobody is home for waits rather than being spent
		// (→ SPEC §5.5, DECISIONS #60). Unclaimed, the overdue sweep hands it to
		// them the morning they're back.
		const audience = (assignee ? [assignee] : roster).filter((member) => !isAway(member, today));
		if (audience.length === 0) continue;

		if (!claim(householdId, task.id, kind, now)) continue;

		// Switching a nudge off silences the phone, it doesn't hold the occurrence
		// open: the flag above is claimed either way (→ DECISIONS #60).
		const listening = audience.filter((member) => member[prefFor(kind)]);
		if (listening.length === 0) continue;

		const payload = payloadFor(task, kind, assignee !== undefined);
		nudges++;
		outbox.push(...listening.map((member) => ({ userId: member.userId, payload })));
	}

	// `sendToUser` never throws and never rejects (→ push.ts), so one dead push
	// service can't cost the household the rest of its morning.
	const delivered = await Promise.all(
		outbox.map(({ userId, payload }) => sendToUser(userId, payload))
	);

	// `nudges` counts occurrences, not messages: an "Anyone" task that goes to
	// both housemates is still one chore being nudged about.
	return { nudges, devices: delivered.reduce((total, count) => total + count, 0) };
}

/**
 * Everything owed a nudge right now, oldest first: due today and never nudged,
 * or already slipped and never nudged for the slip.
 *
 * One query rather than two, because the two conditions can't both hold. A NULL
 * `dueDate` — an undated one-off — satisfies neither comparison, which is
 * exactly right: a task with no date can't be late for it.
 */
function pendingReminders(householdId: string, today: CalendarDate): PendingTask[] {
	return (
		db
			.select({
				id: tasks.id,
				name: tasks.name,
				// NULL is excluded by the WHERE below; the cast keeps `dueDate` honest
				// for the `=== today` test that picks the kind.
				dueDate: sql<CalendarDate>`${tasks.dueDate}`,
				assigneeMemberId: tasks.assigneeMemberId
			})
			.from(tasks)
			.where(
				and(
					eq(tasks.householdId, householdId),
					or(
						and(eq(tasks.dueDate, today), isNull(tasks.dueReminderSentAt)),
						and(lt(tasks.dueDate, today), isNull(tasks.overdueReminderSentAt))
					)
				)
			)
			// The longest-overdue chore is the one worth hearing about first.
			.orderBy(asc(tasks.dueDate), asc(tasks.id))
			.all()
	);
}

/**
 * Take ownership of one nudge. The flag is written before anything is sent, and
 * only if it was still NULL — so the send is a one-shot even if two sweeps ever
 * meet: a slow tick overlapping the next, a second process, a restart
 * mid-morning. Whoever loses the update sees `changes === 0` and moves on.
 *
 * `updatedAt` deliberately stays where it is: being reminded about a task isn't
 * a change to the task.
 */
function claim(householdId: string, taskId: string, kind: ReminderKind, at: Date): boolean {
	const result = db
		.update(tasks)
		.set(kind === 'due' ? { dueReminderSentAt: at } : { overdueReminderSentAt: at })
		.where(
			and(
				eq(tasks.id, taskId),
				eq(tasks.householdId, householdId),
				isNull(kind === 'due' ? tasks.dueReminderSentAt : tasks.overdueReminderSentAt)
			)
		)
		.run();

	return result.changes === 1;
}

/**
 * A chore's own emoji, for the overdue nudge — [4e] draws "🛏️ Bedsheets are
 * overdue", and on a lock screen the picture lands before the sentence does.
 * First match wins, so the specific patterns sit above the general ones ("Clean
 * the bathroom" is a shower, not a broom); anything unrecognised falls back to
 * the clock, which is why the table can afford to be short.
 *
 * It matches the *task's own name*, which the household typed — so the patterns
 * cover both languages the app ships, and a name in neither still gets a clock.
 * Server-only (→ DECISIONS #61).
 */
const TASK_EMOJI: { match: RegExp; emoji: string }[] = [
	{ match: /\b(bed|sheet|linen|duvet|pillow|bett|wäsche|kissen|decke)/i, emoji: '🛏️' },
	{ match: /\b(bin|trash|rubbish|garbage|recycl|müll|mull|abfall|papier)/i, emoji: '🗑️' },
	{ match: /\b(dish|cutlery|plate|geschirr|spül|spul|teller|besteck)/i, emoji: '🍽️' },
	{ match: /\b(laundry|towel|wash|iron|handtuch|waschen|bügel|bugel)/i, emoji: '🧺' },
	{ match: /\b(bath|shower|toilet|sink|bad|dusche|klo|waschbecken)/i, emoji: '🚿' },
	{
		match: /\b(plant|flower|garden|lawn|herb|pflanz|blume|garten|rasen|gießen|giessen)/i,
		emoji: '🪴'
	},
	{ match: /\b(fridge|freezer|kühlschrank|kuhlschrank|gefrier)/i, emoji: '🧊' },
	{ match: /\b(cat|dog|litter|pet|aquarium|katze|hund|streu)/i, emoji: '🐾' },
	{ match: /\b(bulb|lamp|light|birne|lampe|licht)/i, emoji: '💡' },
	{ match: /\b(post|mail|parcel|package|paket|brief)/i, emoji: '📮' },
	{ match: /\b(window|mirror|fenster|spiegel)/i, emoji: '🪟' },
	{
		match:
			/\b(vacuum|hoover|mop|sweep|dust|floor|clean|tidy|saug|wisch|kehr|staub|boden|putz|aufräum|aufraum)/i,
		emoji: '🧹'
	}
];

const DUE_EMOJI = '☑️';
const OVERDUE_EMOJI = '⏰';

/**
 * The nudge itself (→ SPEC §5.6, the toast in [4e]). Returns a function rather
 * than a payload: it goes to whoever is listening, and each of them may read in
 * a different language (→ `push.ts` `PayloadFor`).
 *
 * The tag is per task *and* per kind, so the overdue nudge arrives as its own
 * notification rather than quietly replacing the due one on the lock screen,
 * while a nudge that re-arms (snoozed back onto the same day) replaces its own
 * predecessor instead of stacking a second copy of itself.
 */
function payloadFor(task: PendingTask, kind: ReminderKind, assigned: boolean): PayloadFor {
	if (kind === 'due') {
		return (m) => ({
			title: m.push.taskDue(DUE_EMOJI, task.name, assigned),
			tag: `task-due-${task.id}`,
			url: '/tasks'
		});
	}

	const emoji = TASK_EMOJI.find(({ match }) => match.test(task.name))?.emoji ?? OVERDUE_EMOJI;

	return (m) => ({
		title: m.push.taskOverdue(emoji, task.name, assigned),
		tag: `task-overdue-${task.id}`,
		url: '/tasks'
	});
}
