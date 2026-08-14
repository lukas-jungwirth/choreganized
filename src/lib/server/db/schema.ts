/**
 * Choreganized — full database schema (SQLite via Drizzle).
 *
 * Conventions:
 * - Text UUID primary keys (crypto.randomUUID).
 * - Timestamps: integer ms since epoch (`timestamp_ms` mode → JS Date),
 *   including the Better Auth tables (its CLI generates `timestamp_ms` too).
 * - Calendar dates (task due dates, meal dates, away-until) are stored as
 *   'YYYY-MM-DD' TEXT in the household's local timezone. They are calendar
 *   concepts ("due Thursday"), not instants — never convert them through UTC.
 * - Every app table carries householdId; every query MUST be scoped by it.
 *   See docs/ARCHITECTURE.md → "Household scoping".
 * - Deleting a member must not destroy history: history rows keep snapshots
 *   (taskName/memberName) and use ON DELETE SET NULL for member references.
 *
 * Rationale for individual modelling choices: docs/DATA-MODEL.md
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
// Relative and extensioned, not `$lib`: two things load this file outside Vite
// — drizzle-kit when generating a migration, and Node when `db:seed` strips its
// types — and neither resolves the alias or infers the extension
// (`rewriteRelativeImportExtensions` in tsconfig is what makes this legal TS).
import { LOCALES } from '../../i18n/locale.ts';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());

/* ────────────────────────────────────────────────────────────────────────────
 * Better Auth tables (user / session / account / verification).
 * Field names must match Better Auth's core schema — the drizzle adapter maps
 * on these property names. Verified against better-auth 1.6.23 with
 * `npx @better-auth/cli generate` (plan 00); re-run that diff after upgrades.
 * `verification` is not just for email — Better Auth parks the OAuth state
 * there during the Google round-trip.
 * ──────────────────────────────────────────────────────────────────────────── */

const authTimestamp = (column: string) =>
	integer(column, { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	createdAt: authTimestamp('created_at'),
	updatedAt: authTimestamp('updated_at')
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		token: text('token').notNull().unique(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: authTimestamp('created_at'),
		updatedAt: authTimestamp('updated_at')
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
		scope: text('scope'),
		password: text('password'),
		createdAt: authTimestamp('created_at'),
		updatedAt: authTimestamp('updated_at')
	},
	(t) => [index('account_user_idx').on(t.userId)]
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: authTimestamp('created_at'),
		updatedAt: authTimestamp('updated_at')
	},
	(t) => [index('verification_identifier_idx').on(t.identifier)]
);

/* ────────────────────────────────────────────────────────────────────────────
 * Household & membership
 * ──────────────────────────────────────────────────────────────────────────── */

export const households = sqliteTable('households', {
	id: id(),
	name: text('name').notNull(),
	/** Single active invite code (e.g. "7K4P2X"). NULL = no active invite. */
	inviteCode: text('invite_code').unique(),
	/** IANA timezone; all calendar dates & reminder times are local to this. */
	timezone: text('timezone').notNull().default('Europe/Vienna'),
	/**
	 * Household's own Google Gemini API key for AI recipe import (→ plan 13,
	 * SPEC §4.7). NULL — the default — means AI import is off and only the
	 * JSON-LD link import (plan 12) is offered. Stored plaintext: the DB is this
	 * household's own file in a single-tenant container, so a key that could
	 * decrypt it would have to live in that same container (→ DECISIONS). Never
	 * leaves the server — the Settings load returns only a masked hint.
	 */
	geminiApiKey: text('gemini_api_key'),
	createdAt: createdAt()
});

export const members = sqliteTable(
	'members',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Profile lives on the membership, not the user (display name + colour). */
		displayName: text('display_name').notNull(),
		/** Hex from the member palette, e.g. '#5F8D72'. */
		color: text('color').notNull(),
		role: text('role', { enum: ['owner', 'member'] })
			.notNull()
			.default('member'),
		/**
		 * Holiday pause: while today <= awayUntil (inclusive, household-local),
		 * this member's tasks never count as overdue and get no reminders.
		 */
		awayUntil: text('away_until'),
		/**
		 * Chosen UI language. NULL — the default — means "whatever this device
		 * asks for", i.e. fall through to the browser's `Accept-Language`
		 * (→ `$lib/i18n`, SPEC §6). Stored on the membership rather than in the
		 * cookie alone so a phone and a laptop agree, and so the nightly cron can
		 * write a push notification in the language its recipient reads.
		 */
		locale: text('locale', { enum: LOCALES }),
		notifyTaskReminders: integer('notify_task_reminders', { mode: 'boolean' })
			.notNull()
			.default(true),
		notifyOverdueNudges: integer('notify_overdue_nudges', { mode: 'boolean' })
			.notNull()
			.default(true),
		notifyShoppingUpdates: integer('notify_shopping_updates', { mode: 'boolean' })
			.notNull()
			.default(false),
		/**
		 * The heads-up before a holiday shuts the shops (→ `holidayNotices`,
		 * SPEC §3.6). On by default, unlike the shopping-update switch beside it:
		 * this fires around a dozen times a year rather than a dozen times a week,
		 * and the cost of missing one is a fridge that stays empty for three days.
		 */
		notifyShopClosures: integer('notify_shop_closures', { mode: 'boolean' })
			.notNull()
			.default(true),
		joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		index('members_household_idx').on(t.householdId),
		// v1: one household per user. Drop this to allow multi-household later.
		uniqueIndex('members_user_unique').on(t.userId)
	]
);

/* ────────────────────────────────────────────────────────────────────────────
 * Shopping
 * ──────────────────────────────────────────────────────────────────────────── */

export const stores = sqliteTable(
	'stores',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** List renders stores in this order ("arrange it the way you walk through town"). */
		sortOrder: integer('sort_order').notNull(),
		createdAt: createdAt()
	},
	(t) => [index('stores_household_idx').on(t.householdId, t.sortOrder)]
);

export const shoppingItems = sqliteTable(
	'shopping_items',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		/** NULL storeId groups under virtual "Other". */
		storeId: text('store_id').references(() => stores.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		/**
		 * Manual walking order within a store group (drag-to-reorder). Contiguous
		 * from 0 per (household, store), the way `stores.sortOrder` is per household;
		 * `createdAt`/`id` stay the tiebreakers so a never-reordered list keeps the
		 * order it was added in (→ `utils/shopping` `compareOpen`).
		 */
		sortOrder: integer('sort_order').notNull().default(0),
		/** Quantity/unit optional & freeform-parsed ("×6", "2 L"). */
		quantity: real('quantity'),
		unit: text('unit'),
		addedByMemberId: text('added_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		/** NULL = still to buy. Checked items render struck-through at the group's end. */
		checkedAt: integer('checked_at', { mode: 'timestamp_ms' }),
		checkedByMemberId: text('checked_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt()
	},
	(t) => [index('shopping_items_household_idx').on(t.householdId, t.checkedAt)]
);

/**
 * What this household has ever put on the list, one row per distinct name —
 * the pool the add field completes from ("Rind" → "Rinderhackfleisch").
 *
 * Its own table rather than a query over `shopping_items`, because those are
 * deleted 12 h after they're checked off: the list is a shopping trip, this is
 * the household's vocabulary, and the vocabulary has to outlive the trip.
 * `nameKey` is the name trimmed and lowercased — one row per thing, whichever
 * way it was capitalised — and `name` keeps the spelling it was last written
 * with, because that is what gets offered back.
 */
export const shoppingSuggestions = sqliteTable(
	'shopping_suggestions',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		nameKey: text('name_key').notNull(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		// The upsert's conflict target — "this household already knows that word".
		uniqueIndex('shopping_suggestions_key_unique').on(t.householdId, t.nameKey),
		// The read: the most recently used names, capped (→ services/shopping.ts).
		index('shopping_suggestions_recent_idx').on(t.householdId, t.lastUsedAt)
	]
);

/**
 * The things this household keeps in the cupboard — learned, never declared.
 *
 * Every recipe brings salt, oil and pepper with it, and nobody wants to untick
 * them on the way to the shopping list a hundred times (→ SPEC §4.8). So the
 * ingredient picker [3e] remembers what was left off: `skipCount` goes up each
 * time a name is offered and declined, and from the second time on that name
 * opens unticked. Ticking it again deletes the row — the cupboard is empty
 * again, and the household says so by buying the thing.
 *
 * Keyed like `shopping_suggestions` (`nameKey` = trimmed + lowercased), which is
 * what makes "Olive oil" in one recipe and "olive oil" in the next one word.
 */
export const pantryStaples = sqliteTable(
	'pantry_staples',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		nameKey: text('name_key').notNull(),
		/** How many times it has been offered and left off. */
		skipCount: integer('skip_count').notNull().default(1),
		lastSkippedAt: integer('last_skipped_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('pantry_staples_key_unique').on(t.householdId, t.nameKey)]
);

/* ────────────────────────────────────────────────────────────────────────────
 * Recipes & meal plan
 * ──────────────────────────────────────────────────────────────────────────── */

export const recipes = sqliteTable(
	'recipes',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** Path under UPLOADS_DIR, served via an authed endpoint. NULL = placeholder art. */
		imagePath: text('image_path'),
		timeMinutes: integer('time_minutes'),
		servings: integer('servings'),
		createdByMemberId: text('created_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('recipes_household_idx').on(t.householdId)]
);

export const recipeIngredients = sqliteTable(
	'recipe_ingredients',
	{
		id: id(),
		recipeId: text('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		quantity: real('quantity'),
		unit: text('unit'),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [index('recipe_ingredients_recipe_idx').on(t.recipeId)]
);

export const recipeSteps = sqliteTable(
	'recipe_steps',
	{
		id: id(),
		recipeId: text('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		/** Plain text. Cook mode parses timer durations ("8 min", "8:00") from it. */
		text: text('text').notNull(),
		/**
		 * Whether this step's ingredients were **chosen by hand** in the form
		 * (→ `recipeStepIngredients`). False — the default, and every row written
		 * before this column existed — means cook mode reads them out of the text
		 * instead (→ `$lib/utils/step-highlight`, DECISIONS #127).
		 *
		 * The flag is what makes "this step uses nothing" sayable: an empty list
		 * on its own is indistinguishable from a step nobody has looked at.
		 */
		ingredientsSet: integer('ingredients_set', { mode: 'boolean' }).notNull().default(false),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [index('recipe_steps_recipe_idx').on(t.recipeId)]
);

/**
 * Which ingredients a step uses, and how much of each — the authored answer to
 * what cook mode otherwise guesses from the step text (→ SPEC §4.4, §4.6).
 *
 * `quantity` is a *share of the row above it*, written in that ingredient's own
 * unit: 1 of the 3 tbsp of olive oil goes in first, 2 at the end. NULL means
 * "whatever the ingredient row says", which is the common case and what a
 * freshly ticked ingredient stores. Because it is written in recipe-as-written
 * terms, `?serves=` scales it with exactly the same arithmetic as the ingredient
 * itself (→ `scaleQuantity`, DECISIONS #124).
 *
 * Rows die with either parent: the recipe form replaces ingredients and steps
 * wholesale on every save (→ `services/recipes.ts`), so these are rewritten in
 * the same transaction rather than diffed.
 */
export const recipeStepIngredients = sqliteTable(
	'recipe_step_ingredients',
	{
		id: id(),
		stepId: text('step_id')
			.notNull()
			.references(() => recipeSteps.id, { onDelete: 'cascade' }),
		ingredientId: text('ingredient_id')
			.notNull()
			.references(() => recipeIngredients.id, { onDelete: 'cascade' }),
		/** In the ingredient's unit; NULL = all of it. */
		quantity: real('quantity'),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [
		index('recipe_step_ingredients_step_idx').on(t.stepId),
		// A step names an ingredient once — twice would render two identical chips.
		uniqueIndex('recipe_step_ingredients_pair_unique').on(t.stepId, t.ingredientId)
	]
);

export const meals = sqliteTable(
	'meals',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		/** 'YYYY-MM-DD', household-local. A day holds one meal per slot. */
		date: text('date').notNull(),
		/**
		 * Which meal of the day this is (→ `$lib/utils/meals`). Defaulted to
		 * dinner, which is what every row written before slots existed was
		 * (→ DECISIONS #126).
		 */
		slot: text('slot', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] })
			.notNull()
			.default('dinner'),
		/** Either a saved recipe… */
		recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
		/** …or a free-text "cook something not saved" title. Also serves as the
		 * name snapshot if the recipe is later deleted. App enforces one of the two. */
		title: text('title'),
		cookMemberId: text('cook_member_id').references(() => members.id, { onDelete: 'set null' }),
		createdByMemberId: text('created_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('meals_household_date_slot_unique').on(t.householdId, t.date, t.slot)]
);

/* ────────────────────────────────────────────────────────────────────────────
 * Tasks & points
 *
 * The task row IS the current occurrence: `dueDate` is the next/current due
 * date and the reminder flags belong to that occurrence. Completing or
 * skipping a recurring task logs a task_completions row, advances dueDate,
 * rotates the assignee (if enabled) and resets the reminder flags.
 * ──────────────────────────────────────────────────────────────────────────── */

export const tasks = sqliteTable(
	'tasks',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** Effort presets: Small 5 · Medium 10 · Large 20 · Very large 40. */
		points: integer('points').notNull(),
		/** 'none' = one-off. Otherwise repeats every recurInterval × recurUnit. */
		recurUnit: text('recur_unit', { enum: ['none', 'day', 'week', 'month'] })
			.notNull()
			.default('none'),
		recurInterval: integer('recur_interval').notNull().default(1),
		/** 'YYYY-MM-DD' household-local. NULL = no due date (one-offs only). */
		dueDate: text('due_date'),
		/** NULL = "Anyone" — unassigned, whoever does it gets the points. */
		assigneeMemberId: text('assignee_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		/** Alternate each time: advance assignee through members (join order) on done/skip. */
		rotate: integer('rotate', { mode: 'boolean' }).notNull().default(false),
		/** Reminder idempotency for the CURRENT occurrence; reset on completion/reschedule. */
		dueReminderSentAt: integer('due_reminder_sent_at', { mode: 'timestamp_ms' }),
		overdueReminderSentAt: integer('overdue_reminder_sent_at', { mode: 'timestamp_ms' }),
		createdByMemberId: text('created_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('tasks_household_due_idx').on(t.householdId, t.dueDate)]
);

export const taskCompletions = sqliteTable(
	'task_completions',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
		/** Snapshots survive task/member deletion — history & leaderboard stay intact. */
		taskName: text('task_name').notNull(),
		points: integer('points').notNull(),
		action: text('action', { enum: ['done', 'skipped'] })
			.notNull()
			.default('done'),
		memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
		memberName: text('member_name').notNull(),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('task_completions_household_idx').on(t.householdId, t.completedAt)]
);

/**
 * What each member has already been told — and told us — about one shop
 * closure (→ SPEC §3.6, `utils/holidays.ts`).
 *
 * The closure itself has no row and never will: it is computed from the
 * calendar, the same answer in every household and in every year. This is only
 * the two things a calendar can't know — whether the push has gone out, and
 * whether the reader has waved the banner away — so a row exists only once
 * somebody has been notified or has answered.
 *
 * Per member, not per household: one person tapping "dismiss" must not silence
 * their housemate, who may still be the one doing the shopping.
 */
export const holidayNotices = sqliteTable(
	'holiday_notices',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' }),
		/** The closure's first shut day, 'YYYY-MM-DD' — which notice this is about. */
		closureDate: text('closure_date').notNull(),
		/** Set when the push went out; the idempotency flag, like a task's. */
		pushedAt: integer('pushed_at', { mode: 'timestamp_ms' }),
		/**
		 * Hidden from this member until this household-local date — which is both
		 * answers the banner offers, at two different dates. "Remind me tomorrow"
		 * writes tomorrow; **"Dismiss" writes `closureDate` itself**, i.e. hidden
		 * until the shops are already shut, which is as long as the notice was ever
		 * going to live. One column, because "for good" and "for now" differ only
		 * in how long (→ DECISIONS #131).
		 */
		hiddenUntil: text('hidden_until'),
		createdAt: createdAt()
	},
	(t) => [
		// One row per member per closure — the upsert's conflict target, and the
		// index the banner's read uses.
		uniqueIndex('holiday_notices_member_closure_unique').on(t.memberId, t.closureDate)
	]
);

/* ────────────────────────────────────────────────────────────────────────────
 * Push notifications & cook timers
 * ──────────────────────────────────────────────────────────────────────────── */

export const pushSubscriptions = sqliteTable(
	'push_subscriptions',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** One row per device/browser. Pruned when the push service returns 404/410. */
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		userAgent: text('user_agent'),
		/**
		 * The language this *device* was reading in when it subscribed. A push
		 * goes to a device, and the person who never opened Settings still has a
		 * phone set to something — so this is what makes "detect the system
		 * language" true for notifications as well as for pages. An explicit
		 * `members.locale` outranks it (→ `server/push.ts`).
		 */
		locale: text('locale', { enum: LOCALES }),
		createdAt: createdAt()
	},
	(t) => [index('push_subscriptions_user_idx').on(t.userId)]
);

export const cookTimers = sqliteTable(
	'cook_timers',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		/** e.g. "Mushrooms" — used in the push: "Mushrooms are done — back to step 2". */
		label: text('label').notNull(),
		recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
		stepIndex: integer('step_index'),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
		/** Set when the push was sent (idempotency). */
		notifiedAt: integer('notified_at', { mode: 'timestamp_ms' }),
		canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt()
	},
	(t) => [
		index('cook_timers_ends_idx').on(t.endsAt),
		/**
		 * The dock's read. `ends_at` alone is sized for the sweep's range scan;
		 * this is a different access pattern — every page in the app now asks
		 * "what is this person watching?" once per document load.
		 */
		index('cook_timers_person_idx').on(t.householdId, t.userId, t.endsAt)
	]
);

/* ── Inferred row types ────────────────────────────────────────────────────── */

export type User = typeof user.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type ShoppingSuggestion = typeof shoppingSuggestions.$inferSelect;
export type PantryStaple = typeof pantryStaples.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type RecipeStep = typeof recipeSteps.$inferSelect;
export type RecipeStepIngredient = typeof recipeStepIngredients.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type HolidayNotice = typeof holidayNotices.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskCompletion = typeof taskCompletions.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type CookTimer = typeof cookTimers.$inferSelect;
