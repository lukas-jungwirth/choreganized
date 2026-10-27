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
import {
	sqliteTable,
	text,
	integer,
	real,
	index,
	primaryKey,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
// Relative and extensioned, not `$lib`: two things load this file outside Vite
// — drizzle-kit when generating a migration, and Node when `db:seed` strips its
// types — and neither resolves the alias or infers the extension
// (`rewriteRelativeImportExtensions` in tsconfig is what makes this legal TS).
import { AI_PROVIDERS, AI_SLOTS } from '../../ai.ts';
import { LOCALES } from '../../i18n/locale.ts';
import { THEMES } from '../../theme.ts';
import {
	DEFAULT_CURRENCY,
	DEFAULT_SPLIT_MODES,
	EXPENSE_CATEGORIES,
	EXPENSE_KINDS,
	REPEAT_UNITS,
	SPLIT_MODES
} from '../../utils/expenses.ts';
import { RECIPE_WORDINGS } from '../../utils/wording.ts';

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
	 * Standing instructions for every AI import (→ plan 22, SPEC §6): "we're
	 * vegetarian", "always metric". Set by the owner in Settings → AI features;
	 * NULL = none. At most `AI_INSTRUCTIONS_MAX` characters.
	 */
	aiInstructions: text('ai_instructions'),
	/**
	 * How imported German recipes are worded (→ plan 24, SPEC §6): NULL = as the
	 * site wrote them; `'austrian'` = Austrian German (Obers, Topfen, Erdäpfel),
	 * from the fixed list in `utils/wording.ts`. Owner sets it.
	 */
	recipeWording: text('recipe_wording', { enum: RECIPE_WORDINGS }),
	/**
	 * The one currency every expense amount is in (→ plan 29, SPEC §11.10). The
	 * amounts carry none of their own, so the owner can change this only while
	 * the household has no expenses — later it would relabel them (→ DECISIONS
	 * #170).
	 */
	currency: text('currency').notNull().default(DEFAULT_CURRENCY),
	/**
	 * How a new expense starts out split (→ SPEC §11.5). `equal` means between
	 * everyone; `percent` / `shares` read each person's
	 * `ledger_people.defaultWeight`.
	 */
	splitDefaultMode: text('split_default_mode', { enum: DEFAULT_SPLIT_MODES })
		.notNull()
		.default('equal'),
	createdAt: createdAt()
});

/**
 * The household's own AI provider keys (→ plan 20, SPEC §6) — at most two: the
 * `primary` every AI feature calls, and an optional `backup` that answers when
 * the first is rate-limited, out of quota or down (→ `server/ai/run.ts`). No
 * row at all means AI features are off and only the JSON-LD link import is
 * offered.
 *
 * Keys are stored plaintext: the DB is this household's own file in a
 * single-tenant container, so a key that could decrypt them would have to live
 * in that same container (→ DECISIONS #112). They never leave the server — the
 * Settings load returns provider, model and a masked hint only.
 */
export const aiConnections = sqliteTable(
	'ai_connections',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		slot: text('slot', { enum: AI_SLOTS }).notNull(),
		provider: text('provider', { enum: AI_PROVIDERS }).notNull(),
		apiKey: text('api_key').notNull(),
		/** The provider's own id, picked from its live list (or typed): `gemini-flash-latest`. */
		model: text('model').notNull(),
		/**
		 * Whether the model reads images, as its provider's listing said when it
		 * was picked. NULL = unknown (a typed id, or a listing that doesn't say):
		 * photo import still tries it rather than refusing on a guess.
		 */
		vision: integer('vision', { mode: 'boolean' }),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('ai_connections_household_slot_idx').on(t.householdId, t.slot)]
);

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
		/**
		 * Expenses that involve you — added, your share changed, paid to you, a
		 * repeat logged (→ SPEC §11.11). On by default: it fires only for money
		 * that is yours, never for the household's in general.
		 */
		notifyExpenses: integer('notify_expenses', { mode: 'boolean' }).notNull().default(true),
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
		 * The step's own timer, set in the form [3c] or by an AI import (→ plan 21,
		 * DECISIONS #147): whole seconds, and an optional name ("Nudeln"). NULL —
		 * the default, and every step written before this existed — means cook mode
		 * reads the duration out of `text` instead (→ `utils/timer-parse.ts`). One
		 * per step, because cook mode keeps one ring per step.
		 */
		timerSeconds: integer('timer_seconds'),
		/** NULL = called after its step ("Step 3"), which is always true and never strange. */
		timerLabel: text('timer_label'),
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
 * Feedback
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A bug or an idea, written inside the app and mirrored to a GitHub issue
 * (→ SPEC §6, plan 16, DECISIONS #136).
 *
 * **The row is the receipt; the issue is a copy of it.** The insert is what the
 * member's tap succeeds against, and the API call happens afterwards — so
 * GitHub having a bad afternoon, a token nobody has set yet, or a phone that
 * walks out of signal costs a *sync*, never a report. `issueNumber` is the flag
 * that says the copy exists, and a NULL one is the sweep's queue
 * (→ `services/feedback.ts`).
 *
 * `body` is household content: stored **exactly as typed**, never translated,
 * never tidied (→ SPEC §9). Everything beside it is the diagnostic envelope
 * that makes a report actionable — who wrote it, which language and appearance
 * they were reading in, which build they were on, and what browser it was.
 * Captured at submit time, because "which version was that on?" is a question
 * nobody can answer an hour later.
 */
export const feedback = sqliteTable(
	'feedback',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
		/**
		 * A snapshot, for the reason `task_completions.memberName` is one: the
		 * member reference is ON DELETE SET NULL, and a report has to keep saying
		 * who wrote it after they leave the house.
		 */
		memberName: text('member_name').notNull(),
		/** Which of the two things [6a] asks (→ `utils/feedback.ts`, kept in step). */
		kind: text('kind', { enum: ['bug', 'idea'] }).notNull(),
		/** As written. Household content — never translated, never rewritten. */
		body: text('body').notNull(),
		/** The language it was written in, which is the language its wording is in. */
		locale: text('locale', { enum: LOCALES }).notNull(),
		/**
		 * The appearance it was written on, or NULL for "follow the device" — the
		 * same three answers Settings offers, and NULL is a setting rather than an
		 * absence here too (→ `$lib/theme`, DECISIONS #119).
		 */
		theme: text('theme', { enum: THEMES }),
		/** The build, e.g. `1.0.0+9f3c1a2`, or `dev` (→ `server/version.ts`). */
		appVersion: text('app_version').notNull(),
		/** Verbatim `User-Agent`; NULL when the browser sent none. */
		userAgent: text('user_agent'),
		/** The issue this became. NULL = not mirrored yet, i.e. still queued. */
		issueNumber: integer('issue_number'),
		syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
		/** Mirror attempts spent; the sweep parks a row once it has spent enough. */
		attempts: integer('attempts').notNull().default(0),
		/**
		 * When the sweep may try again — an instant, like a timer's `endsAt`, so
		 * the queue is one indexed range scan and the backoff is a column rather
		 * than arithmetic over `attempts` at every read. Equal to `createdAt` on
		 * insert, which is what makes a fresh row due immediately.
		 */
		nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		/**
		 * Why the last attempt failed — the only trace a silent sync leaves. The
		 * error *code* and status, never a response body: a body can quote the
		 * request that produced it, token and all (→ `server/github.ts`).
		 */
		lastError: text('last_error'),
		createdAt: createdAt()
	},
	(t) => [
		/**
		 * The sweep's queue: everything still waiting for an issue, soonest first.
		 * Sized like `cook_timers_ends_idx` — a range scan over an instant — and a
		 * row that succeeds drops out of it, because a non-NULL `issue_number`
		 * ends the scan's interest in it.
		 */
		index('feedback_pending_idx').on(t.issueNumber, t.nextAttemptAt),
		/** "What has this house sent?" — the household-scoped read, newest first. */
		index('feedback_household_idx').on(t.householdId, t.createdAt)
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

/* ────────────────────────────────────────────────────────────────────────────
 * Expenses (→ plan 29, SPEC §11, docs/DATA-MODEL.md)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Anyone who can pay for or share an expense (→ DECISIONS #168). Today that is
 * one row per membership, created in the same transaction as the membership. A
 * member who leaves keeps their row, with `memberId` NULL and the name and
 * colour they had, so a balance they still owe stays readable. Guests will be
 * `kind = 'guest'` rows that never had a member.
 *
 * `name` and `color` are a snapshot taken when the membership ends; while it
 * lasts, the member row is the truth and the read joins it.
 *
 * Never deleted on its own: only with the household, which is why the expense
 * references to it cascade rather than restrict.
 */
export const ledgerPeople = sqliteTable(
	'ledger_people',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		memberId: text('member_id')
			.unique()
			.references(() => members.id, { onDelete: 'set null' }),
		/**
		 * The person behind the membership, kept after it ends: someone who
		 * leaves and joins the same household again is reconnected to this row,
		 * debts and all, instead of becoming a second person with their name
		 * (→ DECISIONS #174). NULL for guests. Deliberately not a foreign key: the
		 * person — and what they owe — outlives even the account.
		 */
		userId: text('user_id'),
		kind: text('kind', { enum: ['member', 'guest'] })
			.notNull()
			.default('member'),
		name: text('name').notNull(),
		color: text('color').notNull(),
		/**
		 * Their part of the household's default split (→ SPEC §11.5): a percentage
		 * ×100 or a number of shares, by `households.splitDefaultMode`. NULL means
		 * not in the default. Unused while the default is `equal`.
		 */
		defaultWeight: integer('default_weight'),
		createdAt: createdAt()
	},
	(t) => [
		index('ledger_people_household_idx').on(t.householdId),
		index('ledger_people_user_idx').on(t.householdId, t.userId)
	]
);

/**
 * One expense, or one payment between two people (→ DECISIONS #167). A payment
 * is a row whose single share is the recipient's, so the one balance formula
 * — paid minus shares — covers both.
 *
 * Money is integer minor units (cents) and never a float (→ DECISIONS #169).
 */
export const expenses = sqliteTable(
	'expenses',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: EXPENSE_KINDS }).notNull(),
		/** Household content, never translated. NULL for payments. */
		description: text('description'),
		/** NULL for payments. */
		category: text('category', { enum: EXPENSE_CATEGORIES }),
		amountMinor: integer('amount_minor').notNull(),
		/** Household-local `YYYY-MM-DD`; never in the future. */
		date: text('date').notNull(),
		paidById: text('paid_by_id')
			.notNull()
			.references(() => ledgerPeople.id, { onDelete: 'cascade' }),
		splitMode: text('split_mode', { enum: SPLIT_MODES }).notNull(),
		createdByMemberId: text('created_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		updatedByMemberId: text('updated_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		/**
		 * Set by Delete, cleared by its undo bar; the 03:30 cleanup removes rows
		 * deleted more than a day ago. Every read filters it out.
		 */
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
		/**
		 * The series this occurrence belongs to (→ SPEC §11.9) — the first one,
		 * logged by hand with "Repeats", and every one the 06:00 sweep adds. A
		 * plain link: editing the series never rewrites a row already logged.
		 */
		recurrenceId: text('recurrence_id').references(() => expenseRecurrences.id, {
			onDelete: 'set null'
		})
	},
	(t) => [
		index('expenses_household_date_idx').on(t.householdId, t.date),
		index('expenses_paid_by_idx').on(t.paidById),
		index('expenses_recurrence_idx').on(t.recurrenceId)
	]
);

/**
 * Who owes what of an expense. `Σ shareMinor = expenses.amountMinor`, always —
 * the service computes the shares from `input` and writes both in one
 * transaction (→ DECISIONS #169).
 */
export const expenseShares = sqliteTable(
	'expense_shares',
	{
		expenseId: text('expense_id')
			.notNull()
			.references(() => expenses.id, { onDelete: 'cascade' }),
		personId: text('person_id')
			.notNull()
			.references(() => ledgerPeople.id, { onDelete: 'cascade' }),
		shareMinor: integer('share_minor').notNull(),
		/**
		 * What was typed: minor units for `amounts`, a percentage ×100 for
		 * `percent`, a count for `shares`; NULL for `equal` and payments.
		 */
		input: integer('input')
	},
	(t) => [
		primaryKey({ columns: [t.expenseId, t.personId] }),
		index('expense_shares_person_idx').on(t.personId)
	]
);

/**
 * A recurring expense — the template the 06:00 sweep copies into a normal
 * expense each time `nextDate` comes round (→ SPEC §11.9, plan 30).
 *
 * Only the inputs are stored: the split's shares are recomputed from
 * `expense_recurrence_shares.input` on every occurrence, so editing the amount
 * can never leave a stale share behind (→ DECISIONS #169).
 */
export const expenseRecurrences = sqliteTable(
	'expense_recurrences',
	{
		id: id(),
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		description: text('description').notNull(),
		category: text('category', { enum: EXPENSE_CATEGORIES }).notNull(),
		amountMinor: integer('amount_minor').notNull(),
		paidById: text('paid_by_id')
			.notNull()
			.references(() => ledgerPeople.id, { onDelete: 'cascade' }),
		splitMode: text('split_mode', { enum: SPLIT_MODES }).notNull(),
		unit: text('unit', { enum: REPEAT_UNITS }).notNull(),
		/**
		 * The day of the month it was started on (1–31), for `month` and `year`;
		 * a short month clamps to its last day without forgetting it, so a series
		 * from 31 Jan lands on 28 Feb and then 31 Mar (→ `utils/dates`
		 * `addRepeat`). NULL for `week`.
		 */
		anchorDay: integer('anchor_day'),
		/** Household-local `YYYY-MM-DD`: the next occurrence the sweep will add. */
		nextDate: text('next_date').notNull(),
		/** Set by "Stop repeating"; the series and its past stay (→ SPEC §11.9). */
		stoppedAt: integer('stopped_at', { mode: 'timestamp_ms' }),
		createdByMemberId: text('created_by_member_id').references(() => members.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('expense_recurrences_due_idx').on(t.householdId, t.nextDate)]
);

/** Who is in a series' split and what was typed for them — `expense_shares`' `input`, kept. */
export const expenseRecurrenceShares = sqliteTable(
	'expense_recurrence_shares',
	{
		recurrenceId: text('recurrence_id')
			.notNull()
			.references(() => expenseRecurrences.id, { onDelete: 'cascade' }),
		personId: text('person_id')
			.notNull()
			.references(() => ledgerPeople.id, { onDelete: 'cascade' }),
		input: integer('input')
	},
	(t) => [primaryKey({ columns: [t.recurrenceId, t.personId] })]
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
export type Feedback = typeof feedback.$inferSelect;
export type AiConnection = typeof aiConnections.$inferSelect;
export type LedgerPerson = typeof ledgerPeople.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseShare = typeof expenseShares.$inferSelect;
export type ExpenseRecurrence = typeof expenseRecurrences.$inferSelect;
