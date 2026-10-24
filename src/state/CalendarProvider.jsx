import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { eventService } from '../services/eventService'
import { DAY, startOfWeek } from '../utils/calendar'
import { CalendarContext } from './calendarContext'

const STORE_KEY = 'calendar.events.v1'
const SCHEMA_VERSION = 1

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.events)) throw new Error('Unsupported calendar store schema')
    return parsed.events
  } catch (error) {
    console.error('Could not read saved calendar data; starting with a clean event list.', error)
    localStorage.removeItem(STORE_KEY)
    return null
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'commit':
      return {
        ...state,
        events: action.after,
        past: [...state.past, { id: action.id, label: action.label, before: state.events, after: action.after }],
        future: [],
        sync: { ...state.sync, [action.id]: 'saving' },
      }
    case 'undo': {
      const command = state.past[state.past.length - 1]
      if (!command) return state
      return { ...state, events: command.before, past: state.past.slice(0, -1), future: [command, ...state.future] }
    }
    case 'redo': {
      const command = state.future[0]
      if (!command) return state
      return { ...state, events: command.after, past: [...state.past, command], future: state.future.slice(1) }
    }
    case 'sync-status':
      return { ...state, sync: { ...state.sync, [action.id]: action.status } }
    case 'seed':
      return state.events.length ? state : { ...state, events: action.events }
    case 'restore':
      return { ...state, events: action.events }
    default:
      return state
  }
}

function eventActionFor(before, after) {
  const oldIds = new Set(before.map((item) => item.id))
  const newIds = new Set(after.map((item) => item.id))
  if (oldIds.size < newIds.size) return 'create'
  if (oldIds.size > newIds.size) return 'delete'
  return 'update'
}

export function CalendarProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    events: readStore() || [],
    past: [],
    future: [],
    sync: {},
  }))
  const eventsRef = useRef(state.events)
  const seedRequested = useRef(false)
  useLayoutEffect(() => { eventsRef.current = state.events }, [state.events])

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: SCHEMA_VERSION, events: state.events }))
  }, [state.events])

  useEffect(() => {
    if (state.events.length || seedRequested.current) return
    seedRequested.current = true
    eventService.seed().then((todos) => {
      const monday = startOfWeek(new Date())
      const seeded = todos.map((todo, index) => {
        const dayOffset = (todo.id * 7 + todo.userId * 3) % 21
        const hour = 8 + ((todo.id * 5 + todo.userId) % 10)
        const start = new Date(monday.getTime() + dayOffset * DAY)
        start.setHours(hour, index % 2 ? 30 : 0, 0, 0)
        return {
          id: `seed-${todo.id}`,
          remoteId: todo.id,
          title: todo.todo,
          start: start.toISOString(),
          end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
          allDay: false,
          attendeeIds: [todo.userId],
          organizerId: todo.userId,
          color: ['blue', 'violet', 'teal', 'amber'][todo.userId % 4],
          recurrence: null,
          reminder: 'none',
          source: 'seed',
        }
      })
      dispatch({ type: 'seed', events: seeded })
    }).catch((error) => {
      console.error('Could not load sample events from DummyJSON.', error)
    })
  }, [state.events.length])

  const commit = useCallback((after, label, syncEvent = null, syncAction = null) => {
    const id = crypto.randomUUID()
    const before = eventsRef.current
    dispatch({ type: 'commit', id, label, after })
    const changed = syncEvent
    if (!changed) return id
    const action = syncAction || eventActionFor(before, after)
    const performSync = async () => {
      try {
        await eventService.sync(changed, action)
        dispatch({ type: 'sync-status', id, status: 'saved' })
      } catch (error) {
        console.error('DummyJSON could not save this event; keeping the browser copy.', error)
        dispatch({ type: 'sync-status', id, status: 'failed' })
      }
    }
    performSync()
    return id
  }, [])

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const value = useMemo(() => ({
    events: state.events,
    past: state.past,
    future: state.future,
    sync: state.sync,
    commit,
    undo,
    redo,
  }), [state, commit, undo, redo])
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}
