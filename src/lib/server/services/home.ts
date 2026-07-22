/**
 * Home dashboard queries (→ SPEC §2).
 *
 * Home is a read-only summary of four other domains, so it gets its own service
 * rather than reaching into theirs: everything the dashboard shows is composed
 * in `getHomeSummary` and every card degrades to `null`/`0` while the feature
 * that fills it is still unbuilt. Plans 04/07/09 light the cards up by making
 * data exist — **they should not need to touch this file**.
 *
 * What Home shares with the rest of the app lives in `tasks.ts`:
 * `listOverdueForMember` (the tab badge reads the same rows) and
 * `assigneeNotAway` (the SQL half of the holiday pause).
 */
import { and, count, desc, eq, isNull, lte } from 'drizzle-orm';
import { formatTimeIn, hourIn, type CalendarDate } from '$lib/utils/dates';
import { db } from '../db';
import {
	meals,
	members,
	recipes,
	shoppingItems,
	taskCompletions,
	tasks,
	type Member
} from '../db/schema';
import type { HouseholdMember } from './household';
import { assigneeNotAway, monthPointsByMember, type OverdueTask } from './tasks';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export type TonightsDinner = {
	name: string;
	/** Set when the meal came from the recipe library — plan 07 links to it. */
	recipeId: string | null;
	/** Path under UPLOADS_DIR; null renders the placeholder tile. */
	imagePath: string | null;
	cook: { displayName: string; color: string } | null;
};

export type ActivityEntry = {
	id: string;
	taskName: string;
	memberName: string;
	/** From the *current* member row; null once that housemate has left. */
	memberColor: string | null;
	points: number;
	/** Household-local clock time, e.g. "8:20". */
	time: string;
};

export type Standings = {
	/** Competition rank of the current member (1-based, ties share a rank). */
	rank: number;
	/** Sharing the top score with at least one other member. */
	tiedForLead: boolean;
	points: number;
	/** Who the strip compares you against: the runner-up if you lead, else the leader. */
	rival: { displayName: string; gap: number } | null;
};

export type OverdueSummary = {
	count: number;
	/** The one that has been waiting longest — the banner names it. */
	oldestName: string;
	/** Assigned to this member rather than "Anyone" ("· your turn"). */
	mine: boolean;
};

export type HomeSummary = {
	greeting: TimeOfDay;
	dinner: TonightsDinner | null;
	shoppingCount: number;
	tasksDueCount: number;
	/** Newest first, max 2 (→ SPEC §2.1). Empty ⇒ the card is hidden. */
	activity: ActivityEntry[];
	/** Null until somebody has scored this month. */
	standings: Standings | null;
	/** Null when this member has nothing overdue (or is away). */
	overdue: OverdueSummary | null;
};

/**
 * What the `(app)` layout has already loaded for this request. Passing it in
 * rather than re-querying keeps Home to the queries only Home needs — and, more
 * importantly, makes the badge and the banner share one `today`: computing it
 * twice from two `new Date()` calls lets a request that straddles household
 * midnight disagree with itself.
 */
export type HomeContext = {
	member: Member;
	timezone: string;
	today: CalendarDate;
	members: HouseholdMember[];
	overdue: OverdueTask[];
};

export function getHomeSummary(householdId: string, context: HomeContext): HomeSummary {
	const { member, timezone, today } = context;

	return {
		greeting: greetingFor(hourIn(timezone)),
		dinner: tonightsDinner(householdId, today),
		shoppingCount: countUnchecked(householdId),
		tasksDueCount: countDueOrOverdue(householdId, today),
		activity: recentActivity(householdId, timezone),
		standings: monthStandings(householdId, member.id, today, timezone, context.members),
		overdue: overdueSummary(context.overdue, member)
	};
}

function greetingFor(hour: number): TimeOfDay {
	if (hour < 12) return 'morning';
	if (hour < 18) return 'afternoon';
	return 'evening';
}

/** Today's dinner, whether it came from the library or is a free-text meal. */
function tonightsDinner(householdId: string, today: CalendarDate): TonightsDinner | null {
	const meal = db
		.select({
			title: meals.title,
			recipeId: meals.recipeId,
			recipeName: recipes.name,
			imagePath: recipes.imagePath,
			cookName: members.displayName,
			cookColor: members.color
		})
		.from(meals)
		.leftJoin(recipes, eq(meals.recipeId, recipes.id))
		.leftJoin(members, eq(meals.cookMemberId, members.id))
		.where(and(eq(meals.householdId, householdId), eq(meals.date, today)))
		.get();

	if (!meal) return null;

	// `title` doubles as the name snapshot for a deleted recipe, so the recipe
	// name wins while it exists (→ docs/DATA-MODEL.md → meals).
	const name = meal.recipeName ?? meal.title;
	if (!name) return null;

	return {
		name,
		recipeId: meal.recipeName ? meal.recipeId : null,
		imagePath: meal.imagePath,
		cook:
			meal.cookName && meal.cookColor ? { displayName: meal.cookName, color: meal.cookColor } : null
	};
}

function countUnchecked(householdId: string): number {
	const row = db
		.select({ n: count() })
		.from(shoppingItems)
		.where(and(eq(shoppingItems.householdId, householdId), isNull(shoppingItems.checkedAt)))
		.get();

	return row?.n ?? 0;
}

/**
 * "{n} tasks due today" counts today's *and* everything that already slipped
 * (→ SPEC §2.3) — household-wide, not just mine. Tasks belonging to a member on
 * holiday are paused and don't count, which is what the away banner promises.
 */
function countDueOrOverdue(householdId: string, today: CalendarDate): number {
	const row = db
		.select({ n: count() })
		.from(tasks)
		.leftJoin(members, eq(tasks.assigneeMemberId, members.id))
		.where(
			and(eq(tasks.householdId, householdId), lte(tasks.dueDate, today), assigneeNotAway(today))
		)
		.get();

	return row?.n ?? 0;
}

function recentActivity(householdId: string, timezone: string): ActivityEntry[] {
	return (
		db
			.select({
				id: taskCompletions.id,
				taskName: taskCompletions.taskName,
				// The snapshot, so a departed housemate keeps their name in the feed.
				memberName: taskCompletions.memberName,
				memberColor: members.color,
				points: taskCompletions.points,
				completedAt: taskCompletions.completedAt
			})
			.from(taskCompletions)
			.leftJoin(members, eq(taskCompletions.memberId, members.id))
			.where(and(eq(taskCompletions.householdId, householdId), eq(taskCompletions.action, 'done')))
			// `id` breaks ties for completions logged in the same millisecond.
			.orderBy(desc(taskCompletions.completedAt), desc(taskCompletions.id))
			.limit(2)
			.all()
			.map(({ completedAt, ...entry }) => ({
				...entry,
				time: formatTimeIn(completedAt, timezone)
			}))
	);
}

/**
 * Points scored this household-local calendar month, ranked. No reset job: the
 * month is always derived from the completion timestamps (→ DECISIONS #9).
 */
function monthStandings(
	householdId: string,
	memberId: string,
	today: CalendarDate,
	timezone: string,
	roster: HouseholdMember[]
): Standings | null {
	// The Tasks tab's points tiles read the same helper, so the strip and the
	// tiles can never disagree about what somebody has scored this month.
	const pointsByMember = monthPointsByMember(householdId, { today, timezone });
	// The roster comes from the layout, so the avatar stack and this ranking can
	// never be computed against two different reads of `members`.
	const ranked = roster
		.map((member) => ({
			id: member.id,
			displayName: member.displayName,
			points: pointsByMember.get(member.id) ?? 0
		}))
		.sort((a, b) => b.points - a.points);

	const mine = ranked.find((entry) => entry.id === memberId);

	// Sorted descending, so the leader having nothing means nobody has scored —
	// or the only scores belong to members who have left. Either way, no strip.
	if (!mine || ranked[0].points === 0) return null;

	// Competition ranking: equal scores share the better position.
	const rank = ranked.findIndex((entry) => entry.points === mine.points) + 1;
	const tiedForLead =
		rank === 1 && ranked.filter((entry) => entry.points === mine.points).length > 1;

	// Leading? Look down at the runner-up. Otherwise up at whoever tops the list.
	const rival = rank === 1 ? ranked.find((entry) => entry.points < mine.points) : ranked[0];

	return {
		rank,
		tiedForLead,
		points: mine.points,
		rival: rival
			? { displayName: rival.displayName, gap: Math.abs(mine.points - rival.points) }
			: null
	};
}

/** Built from the layout's overdue rows — the tab badge counts the same list. */
function overdueSummary(overdue: OverdueTask[], member: Member): OverdueSummary | null {
	const oldest = overdue[0];
	if (!oldest) return null;

	return {
		count: overdue.length,
		oldestName: oldest.name,
		mine: oldest.assigneeMemberId === member.id
	};
}
