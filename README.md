# Daymark Calendar

A browser-first calendar built with React, Vite, and CSS. DummyJSON provides authentication, attendees, and deterministic sample to-dos; the browser is the source of truth for calendar events.

## Run locally

```sh
npm install
npm run dev
```

The app uses `https://dummyjson.com` directly through the shared Axios client. A public demo account is prefilled in the sign-in hint: `emilys` / `emilyspass`. Run `npm test` for the pure calendar algorithm tests; production assets can be checked with `npm run build`; `npm run lint` runs ESLint.

## Feature checklist

- [x] DummyJSON login, restored session check, logout, protected calendar, cross-tab logout, single-flight refresh on 401.
- [x] URL-backed week/month view, date, attendee filter, and timezone; safe defaults for malformed view/date/timezone values.
- [x] Week and month navigation, mini month picker, event search, and attendee filter.
- [x] Create/edit/delete events, all-day option, attendee selection/search, live busy-attendee warning, recurrence, and reminders.
- [x] Pointer create/move/resize with 15-minute snapping, preview, Escape cancellation, keyboard `M` + arrow move, and live announcements.
- [x] Custom side-by-side overlap layout, daily/weekly/monthly recurrence expansion, until/count bounds, and month-end clamping.
- [x] UTC event instants, selected-timezone display, event detail URLs, and invalid-event not-found state.
- [x] Command-style undo/redo buttons and `Ctrl+Z` / `Ctrl+Shift+Z`.
- [x] Versioned localStorage event store, corruption recovery, and best-effort DummyJSON sync with visible saving/saved/failed state.
- [x] Accessible calendar grids, keyboard day navigation, modal focus trap, Escape handling, and announcements.

## Known limitations

- History is session-memory state; event data survives refresh, but undo/redo history does not.
- DummyJSON intentionally does not persist writes. The UI treats the local versioned store as authoritative and shows remote sync status as best effort. A simulated 20% sync failure exercises rollback. There is no offline queue or server conflict resolution.
- Recurrence rules are represented by one series master plus excluded occurrence dates. “This event” becomes a standalone event; “this and following” splits the series. The monthly rule is based on the selected occurrence's weekday ordinal; exception editing is intentionally lightweight.
- All 254 seed to-dos are paged through in batches of 100 and assigned repeatable dates/times from their IDs, anchored to a fixed calendar week. This gives stable sample events without storing generated recurrence instances.
- Reminders are saved as event metadata; browser notification scheduling is not implemented. Attendee conflict checking warns but does not prevent saving.
- The calendar currently shows a single local week or month (not multi-day agenda/list views); drag creation is available in week view, while month view uses the date cell create action.

See [DESIGN.md](./DESIGN.md) for implementation details and trade-offs.
