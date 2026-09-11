# 15 · Live shopping list

**Goal:** two people in one shop should see each other's ticks. Freshness today is
`refetchOnFocus` (→ ARCHITECTURE), which only fires when the tab is backgrounded and brought
back — nobody does that while holding a trolley. This opens an SSE channel per household,
subscribed by the shopping screen alone, and spends it on the thing that makes it legible: a
tick now **plays out where the row stands** before the row leaves, so a housemate's check reads
as "Elisabeth got the tomatoes", in their colour, in the row's own place in your walking order.
Cashes in the "SSE live updates" item that has sat under DECISIONS "Later" since v1.

Depends on: 03 (shopping), and the guards from 00. SPEC: §3.1 + §8 "Freshness". Design: no new
frame — the notice borrows `UndoBar`'s toast furniture, the tick is `ui/CheckCircle`'s own.

## Build

- `lib/server/live.ts` — the hub: `subscribe(householdId, listener)` / `publish(householdId,
event)` over a `Map<householdId, Set<listener>>` behind `Symbol.for('choreganized.live.hub')`,
  the trick `cron.ts` uses and for the same HMR reason. Nothing throws; a listener that does is
  dropped. `lib/server/live.test.ts` covers fan-out, household isolation, unsubscribe and the
  throwing listener.
- `routes/api/live/+server.ts` — GET, `requireMemberApi`, allow-listed `?topics=`, a
  `ReadableStream` of `text/event-stream`. `retry:` + `: connected` written immediately so
  nothing buffers on an empty body, `: ping` every 25 s, a 30 min cap (the session is resolved
  once at open), teardown from both `cancel()` and the request's abort signal.
- `services/shopping.ts` — publishes after the transaction, beside `notifyShoppingAdd`.
  `setChecked` gains `.returning({ name })` so the event can name the item and so "was this
  ours?" is a row rather than a `changes` count. `addItem`/`setChecked`/`addIngredients` carry
  an actor (a private `memberBadge` lookup, so no public signature changes); `updateItem`,
  `deleteItem`, `reorderItems` and the nightly purge publish a silent `changed`.
- `lib/live.ts` — the `EventSource`, open only while the screen is mounted _and_ the tab is
  visible; a reconnect calls back so the page can refetch what it missed. Also holds
  `SHOPPING_DEP`, because `+page.server.ts` names it too and a `.svelte.ts` reaches for
  `$app/navigation`.
- `lib/live-shopping.svelte.ts` — a rune closure (the `item-suggest.svelte.ts` shape): debounced
  `invalidate('app:shopping')` on every event, a housemate's tick handed to the page, and the
  toast state with its own coalescing.
- `shopping/+page.server.ts` — `event.depends(SHOPPING_DEP)`, so a tick costs this load and not
  the layout's.
- `shopping/+page.svelte` — owns the settle: a `settling` map beside `pending`, one timer per
  row, `SETTLE_MS` 1400 (700 under reduced motion). Both your tap and a housemate's event go
  through it; only yours raises an undo bar, and only at the end.
- `ui/CheckCircle.svelte` — an `animate` prop: the fill pops, the ✓ draws itself with
  `stroke-dasharray`. Written to be reusable by Tasks, wired up only here.
- `shopping/ShoppingRow.svelte` — a `settling` colour: circle checked and animating in it, a
  strike that grows (`text-decoration` can't animate), quantity and avatar faded rather than
  dropped so the row doesn't reflow under its own animation, and a wash of `--tick-color`.
- `shopping/LiveNotice.svelte` — the toast, `UndoBar`'s furniture with their avatar and no
  button. The undo bar wins the slot when both want it.
- `shopping/ShoppingGroup.svelte` — a `saving` flag beside `dragging`, so the server's order is
  taken whole otherwise. Its docstring already promised this; the code never did, which is why
  a housemate's drag never showed (amends DECISIONS #118).
- i18n: `shopping.live.{checked,checkedMany,added,addedMany}` in both catalogs, `RichText` so
  each language places the emphasis.
- Docs: SPEC §3.1 + §8, ARCHITECTURE "Freshness" + routing map, DECISIONS #135 (and
  `SSE live updates` struck from "Later"), README status row.

## Acceptance

- [x] A tick holds its row in place for ~1.4 s, visibly ticked, then the row leaves and the undo
      bar appears — and the POST goes out on tap, not at the end.
- [x] A housemate's tick reaches the other phone with no interaction, plays the same settle in
      their colour, and raises no undo bar.
- [x] Their adds, edits, deletes and drags land too; only ticks and adds are announced.
- [x] Several changes from one person coalesce into one toast with a count.
- [x] A burst of changes costs one refetch, and that refetch re-runs the page load only
      (`x-sveltekit-invalidated=001`).
- [x] The stream closes when the tab is hidden and reopens (and catches up) when it is visible.
- [x] `?topics=` is allow-listed (400) and a signed-out stream is a 401.
- [x] Both languages, both themes, and `prefers-reduced-motion`.
- [x] `npm run check` && `npm run build` && `npm test` clean.

Out of scope: presence ("Elisabeth is also shopping"), per-item attribution on the row
(`checkedByMemberId` exists but is still never selected), the tick animation on Tasks, live sync
on any other screen (the transport is topic-agnostic so they can subscribe later), and offline
mutations.

## What was verified, and how (session 2026-09-10)

A copy of the dev database on port 5180 with two real members in one household: **A** the
preview browser (signed in through an in-page `fetch` to `sign-in/email` with a temporary
`emailAndPassword` flag), **B** a `curl` cookie jar driving form actions headlessly with
`x-sveltekit-action: true`.

- **Wire level.** `curl -N` on the stream: `retry: 3000` + `: connected` arrive immediately,
  `: ping` at 25 s and 50 s over a 60 s hold. Signed out → 401, `?topics=tasks` → 400, no
  topics → 400. B's tick produced exactly one frame on A's stream, carrying the item name and
  B's `displayName`/`color`.
- **Their tick, in the browser.** A `MutationObserver` timeline (timers are clamped in a
  background tab; the DOM is the honest clock): at the event the row was **still in the Grocery
  group** with `settling`, `--tick-color: #C67C51`, the strike drawn, `aria-pressed=true` and
  the header already counting it done; 1400 ms later the row was gone and the toast read
  "Elisabeth got Tomatoes"; the toast cleared at 4 s. No undo bar at any point.
- **Your own tick.** Mid-settle: `settling`, sage `--tick-color`, `animationName:
…tick-pop`, `stroke-dasharray: 30px` on the ✓ — and **no undo bar**. After the settle: row
  gone, bar reads "Shampoo checked off · Undo". Undo put it back and cleared the bar.
- **Coalescing.** Three ticks 400 ms apart: three rows settled in B's colour, toast went
  "Elisabeth got Oat milk" → "got 2 things" → "got 3 things".
- **Traffic.** Instrumented `fetch`: five simultaneous ticks → **one** `/shopping/__data.json`,
  and every refetch carried `x-sveltekit-invalidated=001` — page load only, neither layout.
- **Add and reorder.** An add from B raised "Elisabeth added Marillen" and the row appeared. A
  reorder from B flipped A's Grocery order live and silently, with a sentinel on `window`
  proving no reload happened.
- **Guard.** A stream reopening after the changes had already landed produced a plain catch-up
  refetch and no animation — no row was dragged back out of "Recently bought".
- **Languages and themes.** `members.locale = 'de'` → "Elisabeth hat **Tomatoes** geholt"
  (`<html lang="de-AT">`), item name untranslated as household content. The settle was
  screenshotted in both themes: the terracotta wash reads on cream and on the dark ground.
- **Reduced motion.** The `prefers-reduced-motion` blocks ship for both `CheckCircle` and
  `ShoppingRow` (read back off `document.styleSheets`), and stubbing `matchMedia` shortened the
  settle. Exact timings could not be trusted: the Browser pane is hidden here, so
  `visibilityState` had to be overridden to exercise the visible path at all, and background
  tabs clamp `setTimeout` to ≥1 s — a 1400 ms settle measured 1816–2283 ms. The ordering of
  everything above is unaffected; only the millisecond figures are.
- **Review pass, and what it caught.** Three real ones, all fixed and re-verified:

  1. **The settle released on a wall clock, not on the server.** It dropped the `pending`
     override after 1.4 s regardless of whether the action had landed, so on a connection
     slower than the beat — a shop basement, which is where this feature lives — the row
     snapped back to un-ticked while the undo bar said it was checked off. A settle now ends on
     two conditions: its beat is up _and_ `data.items` agrees (or the row is gone). Verified by
     holding every `__data.json` for 4 s in the page: the row stayed ticked in place from 1.0 s
     to 5.0 s with no undo bar, and left at 7 s when the fetch finally landed. Under the old
     code it flipped back at 1.4 s.
  2. **The growing strike missed wrapped names.** It was a `::after` at `top: 50%; width: 100%`
     — one bar across the box, so a two-line name got a line through the gap between its lines.
     `.name` has `overflow-wrap: anywhere`, and at 375 px "Greyerzer Käse (gerieben)" measures
     39 px against a 20 px line-height. Now an animated `text-decoration-color`, which is
     animatable and lands per line; screenshotted at 375 px with both lines struck.
  3. **`silentReopen` could stay armed** in `live.ts` (set on any `visibilitychange` to visible,
     consumed only when a stream is actually opened), which would make the next genuine
     network reconnect skip its catch-up refetch. Now armed only when there is no live source.

  A fourth was considered and left alone: if a refetch never succeeds, a settling row stays
  ticked in place instead of moving. That is the optimistic state, it is self-healing on the
  next `refetchOnFocus`, and it misleads nobody.

- **A trap worth writing down.** `docs/DECISIONS.md` has entry 119 glued onto the tail of the
  "Later" list (`…iOS polish pass. 119. **The theme is…`) — a merge artefact from an earlier
  session, sitting exactly where the "SSE live updates" line had to be struck. Un-gluing it was
  tried and **reverted**: it makes Prettier see one ordered list running from 1, which renumbers
  every entry from 119 up — #135 came back as #133 — and every `DECISIONS #N` citation in the
  code would have been silently wrong. The run-on is load-bearing until someone renumbers the
  citations too. A comment now says so at the top of the file.

- **Second review pass (`/code-review high --fix`), and what it caught.** Four more, fixed and
  re-verified against the running app:

  1. **The wash popped back up in the middle of a long settle.** `settle-wash` faded to 0 % over
     a hard-coded 1400 ms with no `forwards`, so when it finished the row fell back to the base
     rule's 10 % — invisible while the settle _was_ 1.4 s, and a visible flash now that it runs
     until the server agrees. The keyframe is now a `from` only, so it ends **on** the base
     value and the jump is impossible by construction (read back off `document.styleSheets`:
     one `0%` stop, no `100%`). It also stops duplicating `SETTLE_MS` in two files.
  2. **The live toast could be pinned open indefinitely.** Each coalesced event restarted the
     four seconds, so a housemate working steadily down their half of the list would have kept
     it over the tab bar for the whole trip. Coalescing now adds to the count but not to the
     clock. Verified with a tick every 2.5 s: the window closed 4.4 s after the _first_ event
     and a later one opened a fresh window.
  3. **`reorderItems` announced reorders that never happened** — the publish sat outside the
     guard, so a stale client posting a dead store id made every other phone refetch.
  4. **Protocol refusals on `/api/live` were hard-coded English**, against the "no user-facing
     string in a service" rule and unlike `api/timers`, which catalogues its own. Now
     `m.errors.noTopic` / `unknownTopic` — checked in both languages. The same pass dropped
     `Connection: keep-alive` from the response: it is the HTTP/1.1 default anyway and a
     _forbidden_ header under HTTP/2, so it bought nothing and would break the day this is
     served over h2. (Node still emits its own, which is correct.)

  One reported finding was **downgraded after testing it**: retaining a permanently-closed
  `EventSource` looked like it would strand the screen, but killing a session server-side
  showed the refetch sends the page to /login before it can matter. The stream reference is
  still released — it is right, and it means recovery no longer depends on the hidden→visible
  branch having run — but the comment now says what it actually buys rather than overclaiming.

  Two findings were **left alone on purpose**: the three collections behind a settle
  (`settling`, `settleMeta`, `elapsed`) look mergeable but are deliberately split by
  reactivity — a row should re-render when its colour changes, not when some other row's beat
  ends — and the stream does not check `controller.desiredSize` for back-pressure, which is
  real but unreachable at two members and 30-minute connections.

- `npm run check`, `npm run build` and `npm test` (159 tests) clean.
