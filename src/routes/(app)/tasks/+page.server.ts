/**
 * Tasks (→ SPEC §5). Nine actions, one service call each — the lifecycle lives
 * in `services/tasks.ts`, and everything here is reading a form.
 *
 * Every action recomputes the household's `today` rather than trusting one from
 * the browser: the due date a completion lands on is the household's business,
 * not the phone's.
 */
import { error, fail } from '@sveltejs/kit';
import { requireMember } from '$lib/server/guards';
import { getHousehold, listMembers } from '$lib/server/services/household';
import {
	completeTask,
	createTask,
	deleteTask,
	getTaskList,
	memberStanding,
	monthPointsByMember,
	reassignTask,
	recentCompletions,
	setAway,
	skipTask,
	snoozeTask,
	undoCompletion,
	updateTask,
	type TaskContext,
	type TaskInput,
	type TaskSnapshot
} from '$lib/server/services/tasks';
import { isCalendarDate, todayIn } from '$lib/utils/dates';
import { DEFAULT_POINTS, TASK_NAME_MAX, isRecurUnit } from '$lib/utils/tasks';
import type { Actions, PageServerLoad } from './$types';

/** How many completions the "Recent history" preview shows [05]. */
const HISTORY_PREVIEW = 3;

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	// The clock, the roster and `today` all come from the layout, so the tiles,
	// the sections and the tab badge are answering the same question.
	const { household, today } = await event.parent();
	const context: TaskContext = { today, timezone: household.timezone };

	return {
		list: getTaskList(householdId, context),
		/** Month points by member id; the tiles read it against the roster. */
		points: Object.fromEntries(monthPointsByMember(householdId, context)),
		history: recentCompletions(householdId, context, HISTORY_PREVIEW)
	};
};

/**
 * The household's clock. Actions can't reach the layout's copy, so they ask
 * again — one query, and it keeps "today" a household concept throughout.
 */
function clockOf(householdId: string): TaskContext {
	const household = getHousehold(householdId);
	// Same failure the layout guards against: the FK cascades, so this can only
	// mean the household was deleted mid-request.
	if (!household) error(500, 'Your household record is missing. Please contact support.');

	return { today: todayIn(household.timezone), timezone: household.timezone };
}

function readId(form: FormData): string {
	return String(form.get('id') ?? '');
}

/**
 * A number the service will clamp anyway — this only rejects nonsense.
 *
 * Absence is tested before coercion, because `Number(null)` and `Number('')`
 * are both a perfectly finite **0**: reaching for `Number.isFinite` alone would
 * turn a missing `points` field into a task worth nothing rather than falling
 * back to Medium.
 */
function readNumber(value: FormDataEntryValue | null, fallback: number): number {
	if (typeof value !== 'string' || value.trim() === '') return fallback;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function readDate(value: FormDataEntryValue | null): string | null {
	return isCalendarDate(value) ? value : null;
}

/** Everything the new/edit sheet posts, or the message to send back with a 400. */
function readTaskInput(form: FormData): { input: TaskInput } | { error: string } {
	const name = String(form.get('name') ?? '').trim();
	if (!name) return { error: 'Give the task a name.' };
	if (name.length > TASK_NAME_MAX) return { error: `Keep it under ${TASK_NAME_MAX} characters.` };

	const unit = form.get('recurUnit');

	return {
		input: {
			name,
			points: readNumber(form.get('points'), DEFAULT_POINTS),
			recurUnit: isRecurUnit(unit) ? unit : 'none',
			recurInterval: readNumber(form.get('recurInterval'), 1),
			dueDate: readDate(form.get('dueDate')),
			// The service checks the id really is a housemate's; anything else
			// becomes "Anyone".
			assigneeMemberId: String(form.get('assigneeMemberId') ?? '') || null,
			// An unchecked checkbox posts nothing at all — that's the "off".
			rotate: form.get('rotate') !== null
		}
	};
}

/**
 * The undo snapshot, straight back off the form that carried it to the browser
 * (→ services/tasks.ts `TaskSnapshot`). Read field by field rather than trusted:
 * it arrives as text like any other input, and the service still scopes every
 * id it contains to this household.
 */
function readSnapshot(form: FormData): TaskSnapshot | null {
	const raw = form.get('snapshot');
	if (typeof raw !== 'string') return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== 'object') return null;
	const value = parsed as Record<string, unknown>;

	if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
	if (!isRecurUnit(value.recurUnit)) return null;

	return {
		id: value.id,
		name: value.name,
		points: typeof value.points === 'number' ? value.points : 0,
		recurUnit: value.recurUnit,
		recurInterval: typeof value.recurInterval === 'number' ? value.recurInterval : 1,
		dueDate: isCalendarDate(value.dueDate) ? value.dueDate : null,
		assigneeMemberId: typeof value.assigneeMemberId === 'string' ? value.assigneeMemberId : null,
		rotate: value.rotate === true,
		createdByMemberId: typeof value.createdByMemberId === 'string' ? value.createdByMemberId : null,
		// 0 would be 1970, which sorts an undated one-off to the top rather than
		// back where it was; a missing stamp is better handled downstream.
		createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
		dueReminderSentAt: typeof value.dueReminderSentAt === 'number' ? value.dueReminderSentAt : null,
		overdueReminderSentAt:
			typeof value.overdueReminderSentAt === 'number' ? value.overdueReminderSentAt : null
	};
}

export const actions: Actions = {
	/** The sheet's "Create task" and every one-tap starter on the empty state. */
	create: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const parsed = readTaskInput(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		createTask(householdId, member.id, parsed.input, clockOf(householdId).today);

		return { created: true };
	},

	update: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const parsed = readTaskInput(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		updateTask(householdId, readId(form), parsed.input, clockOf(householdId).today);

		return { updated: true };
	},

	delete: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		deleteTask(householdId, readId(form));

		return { deleted: true };
	},

	/**
	 * Tick it off (→ SPEC §5.4). The response is what the celebration modal is
	 * made of: the points, where the task went next, the live standings, and the
	 * snapshot Undo posts back.
	 */
	complete: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();
		const context = clockOf(householdId);

		const completion = completeTask(householdId, readId(form), member.id, context.today);
		// Somebody else finished it while this screen was open.
		if (!completion) return fail(404, { error: 'That task has already been dealt with.' });

		return {
			completed: {
				completion,
				standing: memberStanding(
					member.id,
					listMembers(householdId),
					monthPointsByMember(householdId, context)
				)
			}
		};
	},

	/** No celebration: a skip is bookkeeping, not an achievement (→ SPEC §5.3). */
	skip: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		skipTask(householdId, readId(form), member.id, clockOf(householdId).today);

		return { skipped: true };
	},

	undo: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const snapshot = readSnapshot(form);
		if (!snapshot) return fail(400, { error: "Couldn't undo that one." });

		undoCompletion(householdId, String(form.get('completionId') ?? ''), snapshot);

		return { undone: true };
	},

	snooze: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const dueDate = readDate(form.get('dueDate'));
		if (!dueDate) return fail(400, { error: 'Pick a date to snooze to.' });

		snoozeTask(householdId, readId(form), dueDate);

		return { snoozed: true };
	},

	reassign: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		reassignTask(householdId, readId(form), String(form.get('assigneeMemberId') ?? '') || null);

		return { reassigned: true };
	},

	/** The holiday pause — always the signed-in member's own (→ SPEC §5.5). */
	away: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		setAway(householdId, member.id, readDate(form.get('until')), clockOf(householdId).today);

		return { away: true };
	}
};
