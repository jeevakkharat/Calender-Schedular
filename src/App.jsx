import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { CalendarProvider } from './state/CalendarProvider'
import { useCalendarStore } from './state/useCalendarStore'
import { TIMEZONES, useCalendar } from './hooks/useCalendar'
import { useDragInteraction } from './hooks/useDragInteraction'
import { useHistory } from './hooks/useHistory'
import { authService } from './services/authService'
import { userService } from './services/userService'
import { DAY, addDays, dateKey, expandEvents, formatTime, layoutOverlaps, parseDate, snapDate, startOfWeek } from './utils/calendar'
import './App.css'

const COLOR_CLASS = { blue: 'event-blue', violet: 'event-violet', teal: 'event-teal', amber: 'event-amber', rose: 'event-rose' }
const HOURS = Array.from({ length: 24 }, (_, index) => index)
const displayPartsCache = new Map()

function useDialogKeyboard(dialogRef, onClose) {
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const focusable = dialog.querySelectorAll('button, input, select, [tabindex="0"]')
    focusable[0]?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (dialog.classList.contains('details-card') && document.querySelector('.event-modal, .scope-dialog')) return
        onClose()
      }
      if (event.key === 'Tab' && focusable.length) {
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault()
          focusable[focusable.length - 1].focus()
        } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          event.preventDefault()
          focusable[0].focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dialogRef, onClose])
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const user = await authService.login(username.trim(), password)
      onLogin(user)
    } catch (apiError) {
      setError(apiError.message || 'Those details did not match a DummyJSON user.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-mark"><CalendarIcon /></div>
        <span className="eyebrow">CALENDAR / PERSONAL</span>
        <h1>Your time,<br /><em>beautifully</em> arranged.</h1>
        <p className="login-copy">Sign in to open your calendar and make room for what matters.</p>
        <form onSubmit={submit} className="login-form">
          <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="e.g. emilys" /></label>
          <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password" /></label>
          {error && <div role="alert" className="form-error">{error}</div>}
          <button className="primary-button login-submit" disabled={busy}>{busy ? <><span className="spinner" /> Signing in</> : <>Enter your calendar <span>↗</span></>}</button>
        </form>
        <p className="login-foot">Demo powered by <a href="https://dummyjson.com/users" target="_blank" rel="noreferrer">DummyJSON users</a>. Try <b>emilys</b> / <b>emilyspass</b>.</p>
      </section>
      <aside className="login-art">
        <div className="art-glow" />
        <div className="art-note note-one"><span>MON · 09:30</span><b>Product sync</b><small>Studio meeting room</small></div>
        <div className="art-note note-two"><span>WED · 14:00</span><b>Design review</b><small>With 3 people</small></div>
        <div className="art-note note-three"><span>FRI · 16:15</span><b>A little breathing room</b><small>Just for you</small></div>
        <div className="art-caption">A calmer way to<br />see the week ahead.</div>
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
      </aside>
    </main>
  )
}

function CalendarApp({ user, onLogout }) {
  const { events, sync, commit } = useCalendarStore()
  const { canUndo, canRedo, undo, redo } = useHistory()
  const eventsRef = useRef(events)
  useLayoutEffect(() => { eventsRef.current = events }, [events])
  const [search, setSearch] = useState('')
  const { params, dates: visibleDates, rangeStart, rangeEnd, displayEvents, heading, setParam, navigateDate, queryString } = useCalendar(events, search)
  const syncStates = Object.values(sync)
  const hasPendingSync = syncStates.includes('saving')
  const latestSync = syncStates.at(-1)
  const [attendees, setAttendees] = useState([])
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [attendeeSearch, setAttendeeSearch] = useState(null)
  const attendeeOptions = attendeeQuery.trim() && attendeeSearch?.query === attendeeQuery.trim()
    ? attendeeSearch.users
    : attendees
  const [modal, setModal] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [liveMessage, setLiveMessage] = useState('')
  const [pendingEditScope, setPendingEditScope] = useState(null)
  const scopeDialogRef = useRef(null)
  const navigate = useNavigate()
  const returnToCalendar = useCallback(() => {
    navigate({ pathname: '/', search: queryString ? `?${queryString}` : '' })
  }, [navigate, queryString])
  const { dragRef, preview: dragPreview, updatePreview: setDragPreview } = useDragInteraction()
  const deletingIds = useRef(new Set())
  function openEvent(event) {
    setSelectedEvent(event)
    navigate({ pathname: `/events/${encodeURIComponent(event.id)}`, search: queryString ? `?${queryString}` : '' })
  }
  useEffect(() => {
    let active = true
    userService.list().then((data) => { if (active) setAttendees(data) })
      .catch((error) => console.error('Could not load calendar attendees.', error))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!attendeeQuery.trim()) return undefined
    let active = true
    const query = attendeeQuery.trim()
    const timeout = setTimeout(() => {
      userService.search(query).then((data) => { if (active) setAttendeeSearch({ query, users: data }) })
        .catch((error) => console.error('Could not search attendees.', error))
    }, 250)
    return () => { active = false; clearTimeout(timeout) }
  }, [attendeeQuery])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  useEffect(() => {
    if (!pendingEditScope) return
    const dialog = scopeDialogRef.current
    const focusable = dialog?.querySelectorAll('button:not(.modal-close)')
    focusable?.[0]?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') { setPendingEditScope(null); setModal(null) }
      if (event.key === 'Tab' && focusable?.length) {
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus() }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingEditScope])

  const commitEvent = useCallback((nextEvent, label, oldEvent = null, action = null) => {
    let after
    const currentEvents = eventsRef.current
    if (oldEvent && currentEvents.some((event) => event.id === oldEvent.id)) after = currentEvents.map((event) => event.id === oldEvent.id ? nextEvent : event)
    else after = [...currentEvents, nextEvent]
    commit(after, label, nextEvent, action)
    setLiveMessage(`${label} saved`)
  }, [commit])

  function deleteEvent(event) {
    if (deletingIds.current.has(event.id)) return
    deletingIds.current.add(event.id)
    const currentEvents = eventsRef.current
    if (event.seriesId) {
      const master = currentEvents.find((item) => item.id === event.seriesId)
      const updatedMaster = {
        ...master,
        recurrence: { ...master.recurrence, excludedDates: [...(master.recurrence.excludedDates || []), event.occurrenceDate] },
      }
      commit(currentEvents.map((item) => item.id === master.id ? updatedMaster : item), 'Delete event occurrence', updatedMaster)
    } else {
      const nextEvents = currentEvents.filter((item) => item.id !== event.id)
      commit(nextEvents, 'Delete event', event, 'delete')
    }
    window.setTimeout(() => deletingIds.current.delete(event.id), 300)
    setSelectedEvent(null)
    returnToCalendar()
    setLiveMessage(`${event.title} deleted`)
  }

  function updateEvent(oldEvent, newEvent, scope = 'one') {
    const currentEvents = eventsRef.current
    if (scope === 'all') {
      const sourceId = oldEvent.seriesId || oldEvent.id
      const master = currentEvents.find((event) => event.id === sourceId) || oldEvent
      commitEvent({ ...newEvent, id: sourceId }, 'Edit recurring event', master)
    } else if (scope === 'following') {
      const sourceId = oldEvent.seriesId || oldEvent.id
      const master = currentEvents.find((event) => event.id === sourceId) || oldEvent
      const originalDate = oldEvent.occurrenceDate
      const prior = { ...master, recurrence: { ...master.recurrence, until: dateKey(addDays(parseDate(originalDate), -1)) } }
      const futureId = crypto.randomUUID()
      const future = { ...newEvent, id: futureId, recurrence: master.recurrence, start: oldEvent.start, end: oldEvent.end }
      commit(currentEvents.filter((item) => item.id !== sourceId).concat(prior, future), 'Edit this and following', future, 'update')
    } else if (oldEvent.seriesId) {
      const master = currentEvents.find((item) => item.id === oldEvent.seriesId)
      const changedMaster = { ...master, recurrence: { ...master.recurrence, excludedDates: [...(master.recurrence.excludedDates || []), oldEvent.occurrenceDate] } }
      const instance = { ...newEvent, id: crypto.randomUUID(), recurrence: null }
      commit([...currentEvents.filter((item) => item.id !== master.id), changedMaster, instance], 'Edit event occurrence', instance, 'create')
    } else {
      commitEvent(newEvent, 'Edit event', oldEvent)
    }
    setModal(null)
    setSelectedEvent(null)
    returnToCalendar()
  }

  function startPointerDrag(event, kind, source, dayIndex, container) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = container.getBoundingClientRect()
    const minutes = Math.max(0, Math.min(1425, Math.round((event.clientY - bounds.top) / 15) * 15))
    const origin = source ? { ...source } : {
      id: crypto.randomUUID(), title: '', start: new Date(visibleDates[dayIndex].getFullYear(), visibleDates[dayIndex].getMonth(), visibleDates[dayIndex].getDate(), Math.floor(minutes / 60), minutes % 60).toISOString(),
      end: new Date(visibleDates[dayIndex].getFullYear(), visibleDates[dayIndex].getMonth(), visibleDates[dayIndex].getDate(), Math.floor(minutes / 60), minutes % 60).toISOString(),
      allDay: false, attendeeIds: [], organizerId: user.id, color: 'blue', recurrence: null, reminder: 'none',
    }
    dragRef.current = {
      kind, source, origin, dayIndex, bounds,
      pointerId: event.pointerId, initialX: event.clientX, initialY: event.clientY,
      startMinutes: minutes, latest: { ...origin }, moved: false,
    }
    setDragPreview({ ...origin })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    window.addEventListener('keydown', onDragKey)
  }

  function updateDragPreview(pointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    if (Math.abs(pointerEvent.clientX - drag.initialX) < 4 && Math.abs(pointerEvent.clientY - drag.initialY) < 4) return
    const width = drag.bounds.width
    const columnWidth = width / 7
    const dayIndex = Math.max(0, Math.min(6, Math.floor((pointerEvent.clientX - drag.bounds.left) / columnWidth)))
    const rawMinutes = pointerEvent.clientY - drag.bounds.top
    const snapped = Math.max(0, Math.min(1439, Math.round(rawMinutes / 15) * 15))
    const day = visibleDates[dayIndex]
    const atMinute = (minute) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minute / 60), minute % 60).toISOString()
    let next = { ...drag.origin }
    const duration = new Date(drag.origin.end) - new Date(drag.origin.start)
    if (drag.kind === 'create') {
      const start = new Date(drag.origin.start)
      const startMinute = start.getHours() * 60 + start.getMinutes()
      const endMinute = Math.max(startMinute + 15, snapped)
      next.start = dayIndex === drag.dayIndex ? drag.origin.start : atMinute(snapped)
      next.end = atMinute(endMinute)
      if (endMinute <= startMinute) {
        next.start = atMinute(snapped)
        next.end = atMinute(startMinute)
      }
    } else if (drag.kind === 'move') {
      const deltaDays = dayIndex - drag.dayIndex
      const deltaMinutes = Math.round((pointerEvent.clientY - drag.initialY) / 15) * 15
      const start = new Date(drag.origin.start)
      start.setDate(start.getDate() + deltaDays)
      start.setMinutes(start.getMinutes() + deltaMinutes)
      const snappedStart = snapDate(start)
      next.start = snappedStart.toISOString()
      next.end = new Date(snappedStart.getTime() + duration).toISOString()
    } else {
      const originalStart = new Date(drag.origin.start)
      const originalEnd = new Date(drag.origin.end)
      const delta = Math.round((pointerEvent.clientY - drag.initialY) / 15) * 15
      if (drag.kind === 'resize-start') {
        originalStart.setMinutes(originalStart.getMinutes() + delta)
        const start = snapDate(originalStart)
        if (start < originalEnd) next.start = start.toISOString()
      } else {
        originalEnd.setMinutes(originalEnd.getMinutes() + delta)
        const end = snapDate(originalEnd)
        if (end > originalStart) next.end = end.toISOString()
      }
    }
    drag.moved = true
    drag.latest = next
    setDragPreview(next)
  }

  function onPointerMove(event) { updateDragPreview(event) }
  function onPointerUp(pointerEvent) {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('keydown', onDragKey)
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !drag.latest) return
    if (drag.kind === 'create') {
      const samePosition = !drag.moved || Math.abs(drag.initialY - pointerEvent.clientY) < 4
      const draft = { ...drag.latest, end: samePosition ? new Date(new Date(drag.latest.start).getTime() + 30 * 60000).toISOString() : drag.latest.end }
      setModal({ type: 'create', event: draft })
    } else {
      if (!drag.moved) {
        setDragPreview(null)
        return
      }
      const updated = { ...drag.latest, id: drag.source.id, title: drag.source.title }
      if (drag.source.seriesId) {
        const master = eventsRef.current.find((item) => item.id === drag.source.seriesId)
        const changedMaster = { ...master, recurrence: { ...master.recurrence, excludedDates: [...(master.recurrence.excludedDates || []), drag.source.occurrenceDate] } }
        const occurrence = { ...updated, id: crypto.randomUUID(), recurrence: null }
        commit([...eventsRef.current.filter((item) => item.id !== master.id), changedMaster, occurrence], drag.kind.startsWith('resize') ? 'Resize event occurrence' : 'Move event occurrence', occurrence, 'create')
      } else {
        commitEvent(updated, drag.kind.startsWith('resize') ? 'Resize event' : 'Move event', drag.source)
      }
      setLiveMessage(`${updated.title} moved to ${new Date(updated.start).toLocaleString()}`)
    }
    setDragPreview(null)
  }
  function onDragKey(event) {
    if (event.key === 'Escape') {
      dragRef.current = null
      setDragPreview(null)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onDragKey)
    }
  }

  function handleCreateSave(event) {
    const newEvent = { ...event, id: crypto.randomUUID(), organizerId: user.id }
    commitEvent(newEvent, 'Create event', null, 'create')
    setModal(null)
  }

  function beginEdit(event) {
    if (event.seriesId || event.recurrence) {
      setPendingEditScope(event.seriesId ? event : { ...event, seriesId: event.id, occurrenceDate: dateKey(new Date(event.start)) })
    } else {
      setModal({ type: 'edit', event })
    }
  }

  function selectScope(scope) {
    if (scope === 'one') {
      setModal({ type: 'edit', event: pendingEditScope, scope })
      setPendingEditScope(null)
    } else {
      setModal({ type: 'edit', event: pendingEditScope, scope })
      setPendingEditScope(null)
    }
  }

  function handleGridKey(event) {
    if (!selectedEvent || event.key.toLowerCase() !== 'm') return
    event.preventDefault()
    setLiveMessage(`Moving ${selectedEvent.title}. Use arrow keys, then Enter to save or Escape to cancel.`)
    const original = selectedEvent
    let current = { ...original }
    const handleMove = (keyEvent) => {
      if (keyEvent.key === 'Escape') {
        setDragPreview(null)
        window.removeEventListener('keydown', handleMove)
        return
      }
      if (keyEvent.key === 'Enter') {
        commitEvent(current, 'Move event', original)
        setSelectedEvent(current)
        setDragPreview(null)
        window.removeEventListener('keydown', handleMove)
        return
      }
      const moved = new Date(current.start)
      if (keyEvent.key === 'ArrowUp') moved.setMinutes(moved.getMinutes() - 15)
      else if (keyEvent.key === 'ArrowDown') moved.setMinutes(moved.getMinutes() + 15)
      else if (keyEvent.key === 'ArrowLeft') moved.setDate(moved.getDate() - 1)
      else if (keyEvent.key === 'ArrowRight') moved.setDate(moved.getDate() + 1)
      else return
      keyEvent.preventDefault()
      const start = snapDate(moved)
      current = { ...original, start: start.toISOString(), end: new Date(start.getTime() + (new Date(original.end) - new Date(original.start))).toISOString() }
      setDragPreview(current)
    }
    window.addEventListener('keydown', handleMove)
  }

  return (
    <div className="app-shell" onKeyDown={handleGridKey}>
      <header className="topbar">
        <Link to="/" className="brand"><span className="brand-icon"><CalendarIcon /></span><span>daymark<span className="brand-dot">.</span></span></Link>
        <div className="topbar-center"><span className="status-pulse" /> Your personal calendar</div>
        <div className="topbar-actions">
          <button className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>↶</button>
          <button className="icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>↷</button>
          <span className="topbar-divider" />
          <button className="avatar-button" title="Sign out" onClick={onLogout}>{user.firstName?.[0] || user.username?.[0] || 'U'}</button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <button className="primary-button create-button" onClick={() => setModal({ type: 'create', event: blankEvent(user.id) })}><span>＋</span> Create event</button>
          <div className="mini-calendar">
            <div className="mini-head"><strong>{params.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><div><button aria-label="Previous month" onClick={() => navigateDate(-1)}>‹</button><button aria-label="Next month" onClick={() => navigateDate(1)}>›</button></div></div>
            <MiniMonth date={params.date} selected={params.date} onSelect={(date) => setParam('date', dateKey(date))} events={displayEvents} />
          </div>
          <div className="side-section">
            <div className="side-section-title">CALENDARS <button className="tiny-plus" title="Create event" onClick={() => setModal({ type: 'create', event: blankEvent(user.id) })}>＋</button></div>
            <label className="calendar-check"><input type="checkbox" defaultChecked /><span className="check-color blue" /> My calendar <small>{displayEvents.length}</small></label>
            <label className="calendar-check"><input type="checkbox" defaultChecked /><span className="check-color violet" /> Team events <small>Shared</small></label>
          </div>
          <div className="side-section">
            <div className="side-section-title">FILTER BY ATTENDEE</div>
            <select className="sidebar-select" value={params.attendee} onChange={(e) => setParam('attendee', e.target.value)} aria-label="Filter by attendee">
              <option value="">Everyone</option>
              {attendees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
            </select>
          </div>
          <div className="side-spacer" />
          <div className="sidebar-tip"><div className="tip-icon">✳</div><b>Make space for focus.</b><p>Drag anywhere in your week to add a new moment.</p></div>
          <div className="sidebar-profile"><img src={user.image || `https://dummyjson.com/icon/${user.username}/64`} alt="" /><span><b>{user.firstName} {user.lastName}</b><small>Personal calendar</small></span><button onClick={onLogout} title="Sign out">↗</button></div>
        </aside>
        <main className="calendar-main">
          <div className="calendar-toolbar">
            <div className="toolbar-title"><h1>{heading}</h1><div className="date-nav"><button onClick={() => navigateDate(-1)} aria-label="Previous">‹</button><button onClick={() => navigateDate(1)} aria-label="Next">›</button><button className="today-button" onClick={() => navigateDate('today')}>Today</button></div></div>
            <div className="toolbar-controls">
              <button className="quick-create" onClick={() => setModal({ type: 'create', event: blankEvent(user.id) })}>＋ <span>Create</span></button>
              <label className="search-wrap"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events" aria-label="Search events" /><kbd>⌘ K</kbd></label>
              <select className="timezone-select" value={params.timezone} onChange={(e) => setParam('tz', e.target.value === 'Local' ? '' : e.target.value)} aria-label="Display timezone">{TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}</select>
              <div className="view-switch"><button className={params.view === 'week' ? 'active' : ''} onClick={() => setParam('view', 'week')}>Week</button><button className={params.view === 'month' ? 'active' : ''} onClick={() => setParam('view', 'month')}>Month</button></div>
            </div>
          </div>
          {params.view === 'week'
            ? <WeekView dates={visibleDates} events={displayEvents} timezone={params.timezone} preview={dragPreview} beginDrag={startPointerDrag} setSelected={openEvent} />
            : <MonthView dates={visibleDates} month={params.date.getMonth()} events={displayEvents} onCreate={(date) => setModal({ type: 'create', event: blankEvent(user.id, date) })} setSelected={openEvent} />}
          <div className="calendar-footer"><span>{displayEvents.length} events shown</span><span className="save-state"><i className={hasPendingSync ? 'is-saving' : ''} />{hasPendingSync ? 'Saving changes…' : latestSync === 'failed' ? 'Sync issue · saved locally' : 'All changes saved'}</span><span>Timezone: {params.timezone}</span></div>
        </main>
      </div>
      <div className="sr-only" aria-live="polite">{liveMessage}</div>
      {modal && <EventModal mode={modal.type} initial={modal.event} timezone={params.timezone} attendees={attendeeOptions} query={attendeeQuery} setQuery={setAttendeeQuery} allAttendees={attendees} events={displayEvents} onCancel={() => setModal(null)} onSave={(value) => modal.type === 'create' ? handleCreateSave(value) : updateEvent(modal.event, value, modal.scope || 'one')} />}
      {pendingEditScope && <div className="modal-backdrop" onMouseDown={() => setPendingEditScope(null)}>      <section className="scope-dialog" ref={scopeDialogRef} role="dialog" aria-modal="true" aria-labelledby="scope-heading" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setPendingEditScope(null)}>×</button><span className="eyebrow">RECURRING EVENT</span><h2 id="scope-heading">Which events?</h2><p>Choose which part of this series you want to change.</p><button onClick={() => selectScope('one')}>This event <span>Only this occurrence</span></button><button onClick={() => selectScope('following')}>This and following <span>From this date onward</span></button><button onClick={() => selectScope('all')}>All events <span>The entire series</span></button></section></div>}
      <Routes><Route path="/" element={null} /><Route path="/events/:id" element={<EventDetails events={events} attendees={attendees} rangeStart={rangeStart} rangeEnd={rangeEnd} timezone={params.timezone} onClose={() => { setSelectedEvent(null); returnToCalendar() }} onEdit={beginEdit} onDelete={deleteEvent} />} /></Routes>
    </div>
  )
}

function EventDetails({ events, attendees, rangeStart, rangeEnd, timezone, onClose, onEdit, onDelete }) {
  const { id } = useParams()
  const dialogRef = useRef(null)
  const detailRequest = useRef(0)
  const detailPending = useRef(false)
  const [attendeeDetail, setAttendeeDetail] = useState(null)
  const [attendeeLoading, setAttendeeLoading] = useState(false)
  const [attendeeError, setAttendeeError] = useState('')
  const event = useMemo(() => events.find((item) => item.id === id) || expandEvents(events, new Date(rangeStart.getTime() - 370 * DAY), new Date(rangeEnd.getTime() + 370 * DAY)).find((item) => item.id === id), [events, id, rangeStart, rangeEnd])
  useDialogKeyboard(dialogRef, onClose)
  async function showAttendee(userId) {
    if (detailPending.current) return
    detailPending.current = true
    const requestId = ++detailRequest.current
    setAttendeeLoading(true)
    setAttendeeError('')
    try {
      const detail = await userService.get(userId)
      if (requestId === detailRequest.current) setAttendeeDetail(detail)
    } catch (error) {
      if (requestId === detailRequest.current) setAttendeeError(error.message)
    } finally {
      if (requestId === detailRequest.current) {
        detailPending.current = false
        setAttendeeLoading(false)
      }
    }
  }
  return (
    <div className="modal-backdrop details-backdrop" onMouseDown={onClose}>
      <section className="details-card" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        {!event ? <><div className="not-found-icon">⌕</div><h2 id="detail-title">Event not found</h2><p>This event may have been removed or the link is invalid.</p><button className="primary-button" onClick={onClose}>Back to calendar</button></> : <>
          <div className={`detail-color ${COLOR_CLASS[event.color] || 'event-blue'}`} />
          <span className="eyebrow">{event.recurrence ? 'RECURRING EVENT' : 'CALENDAR EVENT'}</span>
          <h2 id="detail-title">{event.title}</h2>
          <p className="detail-time">{event.allDay ? 'All day' : `${formatTime(new Date(event.start), timezone === 'Local' ? undefined : timezone)} – ${formatTime(new Date(event.end), timezone === 'Local' ? undefined : timezone)}`}</p>
          <p className="detail-date">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: timezone === 'Local' ? undefined : timezone }).format(new Date(event.start))}</p>
          {event.recurrence && <p className="detail-meta">↻ Repeats {event.recurrence.frequency} · every {event.recurrence.interval || 1}</p>}
          {!!event.attendeeIds?.length && <div className="detail-attendees"><b>Attendees</b><div>{event.attendeeIds.map((userId) => {
            const attendee = attendees.find((person) => person.id === userId)
            return <button key={userId} type="button" disabled={attendeeLoading} onClick={() => showAttendee(userId)} aria-label={`Show ${attendee ? `${attendee.firstName} ${attendee.lastName}` : `attendee ${userId}`}`}>
              {attendee?.image ? <img src={attendee.image} alt="" /> : <span>{attendee?.firstName?.[0] || userId}</span>}
            </button>
          })}</div>
          {attendeeLoading && <small>Loading attendee…</small>}
          {attendeeError && <small role="alert">{attendeeError}</small>}
          {attendeeDetail && <p className="attendee-detail">{attendeeDetail.firstName} {attendeeDetail.lastName} · {attendeeDetail.email}</p>}
          </div>}
          <div className="detail-actions"><button className="secondary-button" onClick={() => onEdit(event)}>Edit event</button><button className="delete-button" onClick={() => onDelete(event)}>Delete</button></div>
        </>}
      </section>
    </div>
  )
}

function WeekView({ dates, events, timezone, preview, beginDrag, setSelected }) {
  const scrollRef = useRef(null)
  const containerRef = useRef(null)
  const visible = useMemo(() => layoutOverlaps(events.filter((event) => !event.allDay)), [events])
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 360
  }, [])
  const onBlankDown = (event, dayIndex) => beginDrag(event, 'create', null, dayIndex, containerRef.current)

  return (
    <section className="week-view" role="grid" aria-label="Calendar week view">
      <div className="week-header">
        <div className="timezone-head">{timezoneOffsetLabel(timezone)}</div>
        {dates.map((date) => <div className={`day-head ${dateKey(date) === dateKey(new Date()) ? 'is-today' : ''}`} key={dateKey(date)}><span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><b>{date.getDate()}</b></div>)}
      </div>
      <div className="week-scroll" ref={scrollRef}>
        <div className="time-gutter">{HOURS.map((hour) => <div key={hour} className="hour-label">{`${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`}</div>)}</div>
        <div className="week-canvas" ref={containerRef} onPointerDown={(event) => {
          if (event.target === event.currentTarget || event.target.classList.contains('hour-rule')) {
            const bounds = event.currentTarget.getBoundingClientRect()
            const index = Math.max(0, Math.min(6, Math.floor((event.clientX - bounds.left) / (bounds.width / 7))))
            onBlankDown(event, index)
          }
        }}>
          {dates.map((date, index) => <div className="day-column" key={dateKey(date)} data-day={index} role="gridcell" aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} tabIndex={index === 0 ? 0 : -1} onKeyDown={(event) => {
            const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
            const offset = offsets[event.key]
            if (offset !== undefined) {
              event.preventDefault()
              const next = Math.max(0, Math.min(6, index + offset))
              event.currentTarget.parentElement.querySelector(`[data-day="${next}"]`)?.focus()
            }
          }} onPointerDown={(event) => {
            if (event.target === event.currentTarget) onBlankDown(event, index)
          }} />)}
          {HOURS.map((hour, index) => <div className="hour-rule" style={{ top: `${index * 60}px` }} key={hour}><span /></div>)}
          {dates.map((date, index) => <div className="column-hit-area" key={`hit-${dateKey(date)}`} style={{ left: `${(index / 7) * 100}%` }} onPointerDown={(event) => {
            if (event.target === event.currentTarget) onBlankDown(event, index)
          }} />)}
          {events.filter((event) => event.allDay).map((event) => {
            const key = dateKeyInZone(new Date(event.start), timezone)
            const index = dates.findIndex((date) => dateKey(date) === key)
            return index < 0 ? null : <button key={event.id} className={`all-day-chip ${COLOR_CLASS[event.color] || 'event-blue'}`} style={{ left: `${(index / 7) * 100}%` }} onClick={() => setSelected(event)}>{event.title}</button>
          })}
          {visible.map((event) => {
            const current = preview?.id === event.id ? preview : event
            const start = new Date(current.start)
            const parts = partsInZone(start, timezone)
            const dayIndex = dates.findIndex((day) => dateKey(day) === `${parts.year}-${parts.month}-${parts.day}`)
            if (dayIndex < 0) return null
            const previewing = preview?.id === event.id
            const startMinute = parts.hour * 60 + parts.minute
            const top = startMinute
            const height = Math.max(24, (new Date(current.end) - start) / 60000)
            const width = 100 / event.columns
            return <div key={event.id} className={`week-event ${COLOR_CLASS[event.color] || 'event-blue'} ${previewing ? 'event-preview' : ''}`} role="button" tabIndex="0" aria-label={`${event.title}, ${formatTime(start, timezone === 'Local' ? undefined : timezone)}`} onClick={() => setSelected(event)} onPointerDown={(e) => beginDrag(e, 'move', event, dayIndex, containerRef.current)} style={{ top: `${top}px`, height: `${Math.max(height, 26)}px`, left: `calc(${dayIndex / 7 * 100}% + ${event.column * width}%)`, width: `calc(${width}% - 3px)` }}>
              <span className="resize-edge top" onPointerDown={(e) => beginDrag(e, 'resize-start', event, dayIndex, containerRef.current)} />
              <b>{event.title}</b><small>{formatTime(start, timezone === 'Local' ? undefined : timezone)} – {formatTime(new Date(current.end), timezone === 'Local' ? undefined : timezone)}</small>
              <span className="resize-edge bottom" onPointerDown={(e) => beginDrag(e, 'resize-end', event, dayIndex, containerRef.current)} />
            </div>
          })}
          {preview && !events.some((event) => event.id === preview.id) && (() => {
            const start = new Date(preview.start)
            const parts = partsInZone(start, timezone)
            const dayIndex = dates.findIndex((day) => dateKey(day) === `${parts.year}-${parts.month}-${parts.day}`)
            return dayIndex < 0 ? null : <div className="week-event event-blue event-preview draft-preview" style={{ top: `${Math.max(0, parts.hour * 60 + parts.minute)}px`, height: `${Math.max(26, (new Date(preview.end) - start) / 60000)}px`, left: `${(dayIndex / 7) * 100}%`, width: 'calc(14.285% - 3px)' }}><b>New event</b></div>
          })()}
        </div>
      </div>
    </section>
  )
}

function MonthView({ dates, month, events, onCreate, setSelected }) {
  const grouped = useMemo(() => {
    const map = new Map()
    for (const event of events) {
      const key = dateKey(new Date(event.start))
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(event)
    }
    return map
  }, [events])
  return <section className="month-view" role="grid" aria-label="Calendar month view">
    <div className="month-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => <span key={name}>{name}</span>)}</div>
    <div className="month-grid">{dates.map((date, index) => {
      const key = dateKey(date)
      const dayEvents = grouped.get(key) || []
      return <div className={`month-cell ${date.getMonth() !== month ? 'outside-month' : ''} ${key === dateKey(new Date()) ? 'is-today' : ''}`} key={key} role="gridcell" tabIndex={index === 0 ? 0 : -1} aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} onDoubleClick={() => onCreate(date)} onKeyDown={(e) => {
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
        const offset = offsets[e.key]
        if (offset !== undefined) {
          e.preventDefault()
          const next = Math.max(0, Math.min(41, index + offset))
          e.currentTarget.parentElement.children[next]?.focus()
        } else if (e.key === 'Enter') onCreate(date)
      }}>
        <button className="month-date" onClick={() => onCreate(date)} aria-label={`Create event on ${key}`}>{date.getDate()}</button>
        {dayEvents.slice(0, 4).map((event) => <button key={event.id} className={`month-event ${COLOR_CLASS[event.color] || 'event-blue'}`} onClick={() => setSelected(event)} title={event.title}>{event.allDay ? '• ' : ''}{event.title}</button>)}
        {dayEvents.length > 4 && <button className="more-events" onClick={() => setSelected(dayEvents[4])}>+{dayEvents.length - 4} more</button>}
        <button className="month-add" onClick={() => onCreate(date)} aria-label={`Add event on ${key}`}>＋</button>
      </div>
    })}</div>
  </section>
}

function MiniMonth({ date, selected, onSelect, events }) {
  const first = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1))
  return <div className="mini-grid">
    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span className="mini-weekday" key={`${day}-${index}`}>{day}</span>)}
    {Array.from({ length: 35 }, (_, i) => {
      const item = addDays(first, i)
      const isCurrentMonth = item.getMonth() === date.getMonth()
      const hasEvent = events.some((event) => dateKey(new Date(event.start)) === dateKey(item))
      return <button key={dateKey(item)} className={`${isCurrentMonth ? '' : 'mini-muted'} ${dateKey(item) === dateKey(selected) ? 'mini-selected' : ''} ${dateKey(item) === dateKey(new Date()) ? 'mini-today' : ''}`} onClick={() => onSelect(item)}>{item.getDate()}{hasEvent && <i />}</button>
    })}
  </div>
}

function EventModal({ mode, initial, timezone, attendees, query, setQuery, allAttendees, events, onCancel, onSave }) {
  const dialogRef = useRef(null)
  const [title, setTitle] = useState(initial.title || '')
  const [start, setStart] = useState(toLocalInput(initial.start))
  const [end, setEnd] = useState(toLocalInput(initial.end))
  const [allDay, setAllDay] = useState(Boolean(initial.allDay))
  const [attendeeIds, setAttendeeIds] = useState(initial.attendeeIds || [])
  const [frequency, setFrequency] = useState(initial.recurrence?.frequency || 'none')
  const [interval, setInterval] = useState(initial.recurrence?.interval || 1)
  const initialStartDate = new Date(initial.start)
  const [monthlyType, setMonthlyType] = useState(initial.recurrence?.monthlyType || (initialStartDate.getDate() >= 29 ? 'monthDay' : 'weekday'))
  const [repeatCount, setRepeatCount] = useState(initial.recurrence?.count || '')
  const [until, setUntil] = useState(initial.recurrence?.until || '')
  const [reminder, setReminder] = useState(initial.reminder || 'none')
  const [error, setError] = useState('')
  const submitRef = useRef(false)
  const conflictIds = useMemo(() => {
    if (!start || !end) return []
    const from = new Date(start).getTime()
    const to = new Date(end).getTime()
    return [...new Set(events.filter((event) => event.id !== initial.id && new Date(event.start) < to && new Date(event.end) > from)
      .flatMap((event) => event.attendeeIds || []).filter((id) => attendeeIds.includes(id)))]
  }, [start, end, events, attendeeIds, initial.id])

  useEffect(() => {
    const focusable = dialogRef.current?.querySelectorAll('input, select, button, [tabindex="0"]')
    focusable?.[0]?.focus()
    const handleKeys = (event) => {
      if (event.key === 'Escape') onCancel()
      if (event.key === 'Tab' && focusable?.length) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeys)
    return () => document.removeEventListener('keydown', handleKeys)
  }, [onCancel])

  function submit(event) {
    event.preventDefault()
    if (submitRef.current) return
    if (!title.trim()) { setError('Give this event a title.'); return }
    const begins = new Date(start)
    const ends = new Date(end)
    if (!start || !end || Number.isNaN(+begins) || Number.isNaN(+ends) || ends <= begins) { setError('End time must be after the start time.'); return }
    submitRef.current = true
    const recurrenceTimeZone = initial.recurrence?.timeZone || (timezone === 'Local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone)
    const recurrenceStart = partsInZone(begins, recurrenceTimeZone)
    const recurrenceWeekday = new Date(Date.UTC(recurrenceStart.year, Number(recurrenceStart.month) - 1, Number(recurrenceStart.day))).getUTCDay()
    const recurrence = frequency === 'none' ? null : {
      frequency,
      interval: Math.max(1, Number(interval) || 1),
      timeZone: recurrenceTimeZone,
      ...(frequency === 'monthly' ? { monthlyType } : {}),
      ...(repeatCount ? { count: Math.max(1, Number(repeatCount)) } : {}),
      ...(until ? { until } : {}),
      ...(frequency === 'monthly' ? { weekdayOrdinal: Math.ceil(Number(recurrenceStart.day) / 7), weekday: recurrenceWeekday } : {}),
    }
    onSave({
      ...initial,
      title: title.trim(),
      start: begins.toISOString(),
      end: ends.toISOString(),
      allDay,
      attendeeIds,
      color: initial.color || 'blue',
      recurrence,
      reminder,
    })
  }

  return <div className="modal-backdrop" onMouseDown={onCancel}>
    <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title" ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-top"><span className="eyebrow">{mode === 'create' ? 'MAKE A MOMENT' : 'EDIT EVENT'}</span><button className="modal-close" onClick={onCancel} aria-label="Close">×</button></div>
      <h2 id="event-modal-title">{mode === 'create' ? 'Add to your calendar' : 'Make it yours.'}</h2>
      <form onSubmit={submit}>
        <label className="form-label">Event title<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What’s happening?" maxLength={100} required /></label>
        <div className="form-row"><label className="form-label">Starts<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></label><label className="form-label">Ends<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required /></label></div>
        <label className="toggle-row"><span><b>All day</b><small>Skip the time slots</small></span><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /></label>
        <div className="form-label">Attendees
          <div className="attendee-picker">
            {attendeeIds.map((id) => {
              const person = allAttendees.find((item) => item.id === id) || { id, firstName: `User ${id}` }
              return <button className="attendee-pill" key={id} type="button" onClick={() => setAttendeeIds((items) => items.filter((item) => item !== id))}>{person.firstName} ×</button>
            })}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" aria-label="Search attendees" />
          </div>
          {query && <div className="attendee-results">{attendees.slice(0, 6).map((person) => <button type="button" key={person.id} onClick={() => { setAttendeeIds((items) => items.includes(person.id) ? items : [...items, person.id]); setQuery('') }}><img src={person.image} alt="" /><span>{person.firstName} {person.lastName}<small>{person.email}</small></span><b>{attendeeIds.includes(person.id) ? '✓' : '+'}</b></button>)}</div>}
          {conflictIds.length > 0 && <div className="conflict-warning" role="status">⚠ {conflictIds.length} attendee{conflictIds.length > 1 ? 's are' : ' is'} already busy at this time.</div>}
        </div>
        <div className="form-row"><label className="form-label">Repeat<select value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label className="form-label">Reminder<select value={reminder} onChange={(e) => setReminder(e.target.value)}><option value="none">No reminder</option><option value="5">5 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option></select></label></div>
        {frequency !== 'none' && <div className="form-row recurrence-row"><label className="form-label">Every<input type="number" min="1" max="99" value={interval} onChange={(e) => setInterval(e.target.value)} /></label><label className="form-label">Occurrences<input type="number" min="1" placeholder="No limit" value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} /></label><label className="form-label">Until<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
          {frequency === 'monthly' && <label className="form-label">Repeat by<select value={monthlyType} onChange={(e) => setMonthlyType(e.target.value)}><option value="monthDay">Same date of month</option><option value="weekday">Same weekday ordinal</option></select></label>}
        </div>}
        {error && <div role="alert" className="form-error">{error}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit">{mode === 'create' ? 'Create event' : 'Save changes'} <span>↗</span></button></div>
      </form>
    </section>
  </div>
}

function blankEvent(userId, date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0)
  const end = new Date(start.getTime() + 60 * 60000)
  return { id: '', title: '', start: start.toISOString(), end: end.toISOString(), allDay: false, attendeeIds: [], organizerId: userId, color: 'blue', recurrence: null, reminder: 'none' }
}
function toLocalInput(value) {
  const date = value ? new Date(value) : new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function partsInZone(date, timezone) {
  if (timezone === 'Local') {
    return {
      year: date.getFullYear(),
      month: String(date.getMonth() + 1).padStart(2, '0'),
      day: String(date.getDate()).padStart(2, '0'),
      hour: date.getHours(),
      minute: date.getMinutes(),
    }
  }
  let formatter = displayPartsCache.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    displayPartsCache.set(timezone, formatter)
  }
  const parts = formatter.formatToParts(date)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { ...values, hour: Number(values.hour), minute: Number(values.minute) }
}
function dateKeyInZone(date, timezone) {
  const parts = partsInZone(date, timezone)
  return `${parts.year}-${parts.month}-${parts.day}`
}
function timezoneOffsetLabel(timezone) {
  const zone = timezone === 'Local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone
  return new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value || 'GMT'
}
function CalendarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" /><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h2M14 14h2M8 17h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
}

function AppContent() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(() => authService.hasSession())
  useEffect(() => {
    if (authService.hasSession()) authService.me().then(setUser).catch((error) => {
      console.error('Session restore failed.', error)
      authService.logout()
    }).finally(() => setChecking(false))
    const expire = () => setUser(null)
    const storage = (event) => { if (event.key === 'calendar.accessToken' && !event.newValue) setUser(null) }
    window.addEventListener('calendar:session-expired', expire)
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener('calendar:session-expired', expire); window.removeEventListener('storage', storage) }
  }, [])
  const logout = useCallback(() => { authService.logout(); setUser(null) }, [])
  if (checking) return <div className="loading-screen"><div className="login-mark"><CalendarIcon /></div><span>Opening your calendar…</span></div>
  return user ? <CalendarApp user={user} onLogout={logout} /> : <Login onLogin={setUser} />
}

export default function App() {
  return <BrowserRouter><CalendarProvider><AppContent /></CalendarProvider></BrowserRouter>
}
