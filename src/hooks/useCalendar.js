import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addDays, dateKey, expandEvents, parseDate, startOfDay, startOfWeek } from '../utils/calendar'

export const TIMEZONES = ['Local', 'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney']

function readParams(searchParams) {
  const view = searchParams.get('view')
  const selectedDate = parseDate(searchParams.get('date')) || startOfDay(new Date())
  const timezone = searchParams.get('tz')
  const attendee = searchParams.get('attendee') || ''
  return {
    view: view === 'month' ? 'month' : 'week',
    date: selectedDate,
    timezone: TIMEZONES.includes(timezone) ? timezone : 'Local',
    attendee: /^\d+$/.test(attendee) ? attendee : '',
  }
}

export function useCalendar(events, search) {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = readParams(searchParams)
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value === '' || value == null) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }
  const dates = useMemo(() => {
    if (params.view === 'week') return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(params.date), index))
    const first = startOfWeek(new Date(params.date.getFullYear(), params.date.getMonth(), 1))
    return Array.from({ length: 42 }, (_, index) => addDays(first, index))
  }, [params.date, params.view])
  const rangeStart = params.view === 'week' ? startOfWeek(params.date) : dates[0]
  const rangeEnd = params.view === 'week' ? addDays(rangeStart, 7) : addDays(dates[41], 1)
  const displayEvents = useMemo(() => expandEvents(events, rangeStart, rangeEnd)
    .filter((event) => !params.attendee || event.attendeeIds?.includes(Number(params.attendee)))
    .filter((event) => !search || event.title.toLowerCase().includes(search.toLowerCase())), [events, rangeStart, rangeEnd, params.attendee, search])
  const heading = params.view === 'month'
    ? params.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `${startOfWeek(params.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(startOfWeek(params.date), 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const dateString = dateKey(params.date)
  const queryString = searchParams.toString()

  useEffect(() => {
    const normalized = new URLSearchParams(searchParams)
    let changed = false
    if (searchParams.get('view') !== params.view) { normalized.set('view', params.view); changed = true }
    if (searchParams.get('date') !== dateString) { normalized.set('date', dateString); changed = true }
    if (searchParams.get('tz') !== params.timezone) { normalized.set('tz', params.timezone); changed = true }
    if (searchParams.has('attendee') && searchParams.get('attendee') !== params.attendee) { normalized.delete('attendee'); changed = true }
    if (changed) setSearchParams(normalized, { replace: true })
  }, [searchParams, setSearchParams, params.view, params.timezone, params.attendee, dateString])

  function navigateDate(direction) {
    if (direction === 'today') {
      setParam('date', dateKey(new Date()))
      return
    }
    const next = new Date(params.date)
    if (params.view === 'week') next.setDate(next.getDate() + direction * 7)
    else next.setMonth(next.getMonth() + direction)
    setParam('date', dateKey(next))
  }

  return { params, dates, rangeStart, rangeEnd, displayEvents, heading, setParam, navigateDate, queryString }
}
