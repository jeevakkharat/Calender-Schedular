# Calendar design note

## State, commands, and persistence

`CalendarProvider` owns the event array and the undo/redo stacks. A user mutation creates a command containing the before and after event snapshots, a label, and an id. Applying a command pushes it to `past` and clears `future`; undo moves the newest past command to the front of future and restores its `before` snapshot; redo performs the inverse with its `after` snapshot. This makes a single drag one command and keeps the button and keyboard paths on the same history implementation.

The event store is JSON under `calendar.events.v1`, with an explicit schema version. Each write stores `{ version, events }`. On startup, an invalid JSON payload or unsupported schema is logged and discarded rather than partially interpreted. The initial sample set is fetched from `/todos` in 100-item pages only when the store has no events. Todo IDs are mapped deterministically to a fixed week, start time, one-hour duration, and organizer, so the same todo gets the same sample appointment after refresh. Recurrence instances are generated at render time and never persisted as separate rows.

The reducer applies optimistic local changes immediately. Each attempted sync has a unique status id and uses the same Axios instance as login and attendee requests. A deterministic 20% probability gate simulates a transient failure before the DummyJSON write. On failure, rollback only replaces a matching event version; if a later edit has superseded it, the newer value remains. The reducer also rebases matching snapshots in both history stacks. This matters in the sequence “drag, edit, drag while an earlier save is pending”: an older failure cannot reset the latest drag, and undoing a later command does not resurrect the failed intermediate value. Local storage remains the source of truth because DummyJSON confirms writes but does not save them.

History deliberately stays in memory. Persisting it would require a migration strategy for command snapshots and would increase storage churn; event data and recurrence rules are the durable user state.

## Layout and interactions

`layoutOverlaps` sorts a day’s timed events by start, then end. It sweeps chronologically and groups events while their intervals intersect. For each group it assigns the first column whose previous end is at or before the new start; otherwise it opens a column. Every event in the connected overlap group gets the same column count, so its horizontal position is `column / columns` and width is `1 / columns`. This is custom interval-partitioning logic rather than a calendar package.

The week canvas represents a minute as one CSS pixel across a 24-hour day, from midnight through 23:59. It opens scrolled to 06:00 while earlier and later hours remain available. Pointer handlers keep the origin, pointer coordinates, scroll container, and latest preview in a ref; the visual preview is committed through `requestAnimationFrame`. Pointer-up emits one command; Escape clears the ref and preview. Create, move, and resize use 15-minute snapping. Keyboard move reuses the same event update command. A moving recurring occurrence is excluded from the series and stored as a standalone event, preserving the remaining occurrences.

The week/month and date, timezone, and attendee filter are parsed from the URL. The date parser round-trips calendar fields to reject impossible dates; unknown views and timezones fall back to week and local time. Display formatting and day placement use `Intl.DateTimeFormat` in the selected timezone while stored timestamps remain ISO UTC instants.

## Recurrence

Only events intersecting the visible date range are expanded. The expander starts with the series start and advances calendar days, weeks, or months using UTC calendar arithmetic. New instances are converted from the series’ stored IANA timezone wall-clock fields back to UTC. The conversion checks candidate offsets around timezone transitions; if a local time falls into a DST gap, it moves forward to the next valid wall time. Monthly day numbers are clamped to the destination month's final day (for example, the 31st becomes the 28th/29th in February). A monthly weekday-ordinal rule supports patterns such as the second Tuesday. Generation stops at the earlier of `count` and `until`, or after the visible range; an additional bound prevents unbounded iteration.

Recurring instances share a `seriesId`; an excluded-date list records edited/deleted occurrences. “This event” creates a standalone replacement, “this and following” closes the old series the day before the selected occurrence and starts a new series, and “all events” edits the master. This is intentionally a small client-side rule model, not full RFC 5545 compatibility.

## Hard problem and fix

One hard problem I faced was a date-selection bug in the calendar. The UI looked fine, but when I clicked different days, the wrong events showed up and the selected day sometimes reset. After checking the logic, I found that I was comparing dates in different formats — some were `Date` objects, some were strings, and some were timezone-adjusted values. The same day was being treated as different values by the app. I fixed it by normalizing all dates to one format (`YYYY-MM-DD`), comparing only consistent values, and validating timezone edge cases before updating state. This made the logic stable and taught me to normalize data before writing business logic.
