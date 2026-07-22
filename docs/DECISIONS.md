# Decisions

Running log of product/tech decisions, including deliberate deviations from the design file.
Agents: when you make a judgment call that isn't in SPEC/ARCHITECTURE, **append it here**
(next number, one short block). When you deviate from a plan, note it in the plan file too.

## Resolved

1. **Auth is Google-only in v1** — design [5a] shows email+password and an Apple button; the
   stack decision (Better Auth, Google OAuth only, email later) wins. Login renders a single
   Google button; Settings has no Password row. Revisit when adding email or passkeys.
2. **Effort presets are the canonical points**: 5 / 10 / 20 / 40 (Small/Medium/Large/Very
   large) per [3b] and the brief. The stray +15/+25 values in some mockups are design
   artifacts. `points` is stored as an int, so custom values are possible later without
   migration.
3. **No Tailwind.** Vanilla CSS + design tokens + scoped styles (the design is bespoke; tokens
   map 1:1). Prevents two styling systems drifting.
4. **Drizzle ORM over raw SQL/Prisma** — TS schema, real migrations, negligible runtime,
   first-class better-sqlite3 support. Answers the brief's "some ORM if valuable?" → yes.
5. **The task row is the occurrence** (no occurrences table): recurring tasks keep one row;
   completing advances `dueDate` and logs an immutable `task_completions` snapshot. Simplest
   model that supports the whole design (incl. undo, rotation, reminders). Trade-off: no
   future-occurrence preview — not in the design anyway.
6. **Next due is computed from completion day**, not the missed due date ([4d] shows "Next due
   Aug 14" for a monthly task completed Jul 14 → today-based). Overdue tasks don't pile up
   phantom occurrences.
7. **One household per user (v1)** — enforced by a unique index on `members.userId` only;
   schema otherwise supports multi-household. Leaving/removal → back to onboarding.
8. **Timezone lives on the household** (captured from the creator's browser, default
   Europe/Vienna). All calendar dates are household-local TEXT `YYYY-MM-DD`; reminders fire at
   08:00 household-local. Weeks start Monday. UI English (i18n later).
9. **Leaderboard month is derived** from completion timestamps in the household timezone — no
   monthly reset job, history keeps all months.
10. **Any member can invite** (view/share the active code); only the **owner** can revoke/
    regenerate the code, change roles, remove members, rename the household. (Design labels the
    members screen "owner view" but only scopes roles/removal to owner in copy; for a
    two-person household, member-invite is friendlier.)
11. **Single owner, "Make owner" transfers** the role (the design offers no multi-owner UI
    like demote). Owner must transfer before leaving; the last member leaving deletes the
    household (confirm dialog).
12. **Removed/left members**: membership row deleted; their completions keep name snapshots
    ("points stay with the house"); their assigned tasks become **Anyone**.
13. **Checked shopping items auto-clear** ~12 h after checking (nightly cleanup cron). Keeps
    the "2 of 9 done" trip context without a manual clear chore.
14. **Cook-mode timers & ingredient highlights are parsed, not authored** — durations via regex
    from step text ("8 min", "8:00", "8–10 minutes" → first value), ingredient underlines via
    case-insensitive name matching. Recipe form stays plain text ([3c] has no timer fields).
    Manual "Set timer" stepper covers unparsed steps.
15. **Timer push precision**: in-process `setTimeout` at creation (second-precision) + minute
    cron as restart-safe catch-up; the row in `cook_timers` is the source of truth.
16. **One meal slot per day** (dinner) — `UNIQUE(householdId, date)` per the design's week
    list. Lunch/breakfast would be a schema extension (add a `slot` column) later.
17. **Sheets are components, not routes** (except recipe form + cook mode, which are
    deep-linkable routes). Keeps URLs clean and the tab shell stable.
18. **Recipe images**: uploaded to `UPLOADS_DIR` volume, resized to ≤1200px WebP via `sharp`
    (added in plan 07), served through an authed endpoint that checks household membership.
    Not `static/` — uploads must not be world-readable or lost on redeploy.
19. **adapter-node + one container + SQLite volume** — no separate DB image (answers the
    brief's Dockerfile question). Backups via nightly `.backup`/Litestream, plan 11.
20. **Load + form actions only** (no experimental remote functions, no client fetch layer);
    JSON endpoints only for push subscribe, timers, uploads. Progressive enhancement via
    `use:enhance`.
21. **"Anyone" tasks nudge everyone** (due/overdue reminders go to all members with the
    relevant toggle on; assigned tasks nudge only the assignee).
22. **Popular starters** ([7f]) prefill: bins Weekly Small·5, bedsheets Monthly Medium·10,
    bathroom Every-2-weeks Large·20 — assignee Anyone, first due today, editable after.
23. **Auth tables follow Better Auth's generated schema exactly** (plan 00): all timestamps are
    `timestamp_ms` like the rest of the schema — not seconds as originally written — plus
    NOT NULL `verification.created_at/updated_at` and an index on `identifier` (migration 0001).
    Drizzle's timestamp _mode_ is invisible to migrations, so a mismatch there would have been
    silent; the diff procedure is in [DATA-MODEL.md](DATA-MODEL.md).
24. **The login button keeps Google's own styling** (white, 1.5px border, colour mark) rather
    than the sage primary — that's what Google's branding requires and it's exactly the social
    button in [5a], scaled to the primary button's size since it's now the only action. The
    design's "New here? Create an account" footer becomes "New here? Signing in with Google
    creates your account", because Google-only sign-in has no separate sign-up (→ #1).
25. **The dev seed is idempotent, never destructive**: every seeded row carries a deterministic
    `seed:{householdId}:{kind}:{name}` id and is inserted `ON CONFLICT DO NOTHING`, so
    `npm run db:seed` can run any number of times, adds demo data to a household you already
    created, and never overwrites something you changed in the app. Extend it the same way.
26. **Joining is two steps on one route, not a live lookup.** `/onboarding/join` posts the code
    to a form action and, on success, redirects to `?code=XXXXXX` — the resolved code lives in
    the URL, so a refresh keeps its place and the invite preview arrives with the page. The
    alternative (validating as you type) would need a public JSON endpoint, which the
    load-and-form-actions rule reserves for push/timers/uploads (→ #20).
27. **Invite links hand off through a short-lived `invite_code` cookie.** `/j/{code}` is public
    and only shows the preview; accepting parks the code in an httpOnly, SameSite=Lax, one-hour
    cookie and sends you to sign-in, because Google's redirect can't carry our state. After
    auth, `/` reads the cookie and resumes at the join screen; joining (or creating a household
    instead) clears it.
28. **The member palette exists twice on purpose** — as `--member-*` tokens in `app.css` and as
    hex values in `src/lib/member-colors.ts`. Colours are written to `members.color` and read
    back to paint avatars, so they're data as well as styling; the JS module is the one place
    that says so, and the two must be changed together.

## Open questions (non-blocking, defaults chosen)

- **Production domain** — invite links & OAuth redirect need the final origin (design shows
  `choreganized.app`). Default: whatever Coolify serves; set `ORIGIN`/`BETTER_AUTH_URL`.
- **Google OAuth credentials** — need a GCP OAuth client (redirect URI
  `{origin}/api/auth/callback/google`) before plan 00 can be verified end-to-end.
- **Language** — UI is English like the design; German/i18n not planned for v1.
- **Recipe share** ([7c] "Share") — v1 ships plain-text share (Web Share API). Public share
  links would need a tokenized public route; deferred.

## Later (explicitly out of v1 scope)

SSE live updates · passkeys · email auth · Apple sign-in · multi-household ·
meal slots beyond dinner · offline mutations · recipe import from URL · iOS polish pass.
