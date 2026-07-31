import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { getHousehold, listMembers } from '$lib/server/services/household';
import { getHomeSummary } from '$lib/server/services/home';
import {
	completeTask,
	memberStanding,
	monthPointsByMember,
	parseSnapshot,
	setAway,
	snoozeTask,
	undoCompletion,
	type TaskContext
} from '$lib/server/services/tasks';
import { isCalendarDate, todayIn } from '$lib/utils/dates';
import type { Actions, PageServerLoad } from './$types';

/**
 * Home is a read-only dashboard: one service call (→ SPEC §2). The timezone,
 * today, the roster and the overdue rows all come from the layout, which has
 * already read them for the shell — so the page adds queries rather than
 * repeating them, and every card is answering the same clock.
 *
 * The one exception is the next-chore card [8b], which can be acted on without
 * leaving the screen: the four actions below are the same thin wrappers the
 * Tasks page has, over the same service functions, so a chore ticked off here
 * and one ticked off there are the same event.
 */
export const load: PageServerLoad = async (event) => {
	const { member, householdId } = requireMember(event);
	const { household, today, members, overdue } = await event.parent();

	return getHomeSummary(householdId, {
		member,
		timezone: household.timezone,
		today,
		members,
		overdue
	});
};

/**
 * The household's clock, plus the reader's language — an action can't reach the
 * layout's data, so it asks again (as `tasks/+page.server.ts` does).
 */
function clockOf(event: RequestEvent, householdId: string): TaskContext {
	const household = getHousehold(householdId);
	// The FK cascades, so this can only mean the household was deleted mid-request.
	if (!household) error(500, catalog(event.locals.locale).errors.householdMissing);

	return {
		today: todayIn(household.timezone),
		timezone: household.timezone,
		locale: event.locals.locale
	};
}

function readId(form: FormData): string {
	return String(form.get('id') ?? '');
}

function readDate(value: FormDataEntryValue | null): string | null {
	return isCalendarDate(value) ? value : null;
}

export const actions: Actions = {
	/**
	 * The card's CTA. The card only ever shows this member's own or an "Anyone"
	 * chore, so there is no "who did it?" question to ask: it's always theirs
	 * (→ SPEC §5.4). The response is what the celebration modal is made of.
	 */
	complete: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();
		const context = clockOf(event, householdId);

		const completion = completeTask(householdId, readId(form), member.id, context.today);
		// Somebody else finished it while this screen was open.
		if (!completion) {
			return fail(404, { error: catalog(event.locals.locale).errors.tasks.gone });
		}

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

	undo: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const snapshot = parseSnapshot(form.get('snapshot'));
		if (!snapshot) {
			return fail(400, { error: catalog(event.locals.locale).tasks.done.undoFailed });
		}

		undoCompletion(householdId, String(form.get('completionId') ?? ''), snapshot);

		return { undone: true };
	},

	snooze: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const dueDate = readDate(form.get('dueDate'));
		if (!dueDate) {
			return fail(400, { error: catalog(event.locals.locale).errors.tasks.snoozeDate });
		}

		snoozeTask(householdId, readId(form), dueDate);

		return { snoozed: true };
	},

	/** The holiday pause the snooze sheet offers alongside — always your own. */
	away: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		setAway(householdId, member.id, readDate(form.get('until')), clockOf(event, householdId).today);

		return { away: true };
	}
};
