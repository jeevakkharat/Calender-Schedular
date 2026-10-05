export const MINUTE = 60 * 1000
export const DAY = 24 * 60 * MINUTE
export const SNAP_MINUTES = 15
const formatterCache = new Map()

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function startOfWeek(date) {
  const day = startOfDay(date)
  day.setDate(day.getDate() - day.getDay())
  return day
}

export function addDays(date, count) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function recurrenceDateKey(date, timeZone) {
  const parts = timeZone ? partsInTimezone(date, timeZone) : {
    year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
  }
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

export function snapDate(date, minutes = SNAP_MINUTES) {
  const snapped = new Date(date)
  snapped.setSeconds(0, 0)
  snapped.setMinutes(Math.round(snapped.getMinutes() / minutes) * minutes)
  return snapped
}

export function formatTime(date, timeZone) {
  const key = timeZone || 'Local'
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone })
    formatterCache.set(key, formatter)
  }
  return formatter.format(date)
}

export function zonedDateTime(date, timeZone) {
  const key = `long-${timeZone || 'Local'}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone,
    })
    formatterCache.set(key, formatter)
  }
  return formatter.format(date)
}

function partsInTimezone(date, timeZone) {
  const key = `parts-${timeZone}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    formatterCache.set(key, formatter)
  }
  const parts = formatter.formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function zonedDate(parts, timeZone) {
  const wallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0)
  const candidates = new Set()
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = new Date(wallTime + hours * 60 * MINUTE)
    const local = partsInTimezone(sample, timeZone)
    candidates.add(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - sample.getTime())
  }
  const resolved = [...candidates].map((offset) => new Date(wallTime - offset))
  const exact = resolved.filter((candidate) => {
    const actual = partsInTimezone(candidate, timeZone)
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].every((key) => actual[key] === (parts[key] || 0))
  }).sort((a, b) => a - b)
  if (exact.length) return exact[0]
  return resolved.map((candidate) => {
    const actual = partsInTimezone(candidate, timeZone)
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    return { candidate, delta: actualWallTime - wallTime }
  }).filter(({ delta }) => delta > 0).sort((a, b) => a.delta - b.delta)[0]?.candidate || resolved[0]
}

function occurrenceFor(rule, originalStart, index) {
  const start = new Date(originalStart)
  const source = rule.timeZone ? partsInTimezone(start, rule.timeZone) : {
    year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate(),
    hour: start.getHours(), minute: start.getMinutes(), second: start.getSeconds(),
  }
  const date = new Date(Date.UTC(source.year, source.month - 1, source.day))
  const interval = Math.max(1, Number(rule.interval) || 1)
  if (rule.frequency === 'daily') date.setUTCDate(date.getUTCDate() + interval * index)
  else if (rule.frequency === 'weekly') date.setUTCDate(date.getUTCDate() + interval * 7 * index)
  else if (rule.frequency === 'monthly') {
    const originalDay = source.day
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + interval * index)
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(originalDay, lastDay))
  }
  if (rule.frequency === 'monthly' && rule.weekdayOrdinal &&
      (rule.monthlyType === 'weekday' || !rule.monthlyType)) {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const weekday = Number(rule.weekday)
    const first = 1 + ((weekday - new Date(Date.UTC(year, month, 1)).getUTCDay() + 7) % 7)
    const ordinal = Number(rule.weekdayOrdinal)
    const lastDate = new Date(Date.UTC(year, month + 1, 0))
    const day = ordinal === -1
      ? lastDate.getUTCDate() - ((lastDate.getUTCDay() - weekday + 7) % 7)
      : Math.min(first + (ordinal - 1) * 7, lastDate.getUTCDate() - ((lastDate.getUTCDay() - weekday + 7) % 7))
    date.setUTCDate(day)
  }
  const parts = {
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: source.hour, minute: source.minute, second: source.second || 0,
  }
  if (rule.timeZone) return zonedDate(parts, rule.timeZone)
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

function firstVisibleOccurrenceIndex(rule, start, lower, duration) {
  const first = rule.timeZone ? partsInTimezone(start, rule.timeZone) : {
    year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate(),
  }
  const lowerDate = new Date(lower - duration)
  const target = rule.timeZone ? partsInTimezone(lowerDate, rule.timeZone) : {
    year: lowerDate.getFullYear(), month: lowerDate.getMonth() + 1, day: lowerDate.getDate(),
  }
  const interval = Math.max(1, Number(rule.interval) || 1)
  if (rule.frequency === 'monthly') {
    const months = (target.year - first.year) * 12 + target.month - first.month
    return Math.max(0, Math.floor(months / interval))
  }
  const firstDay = Date.UTC(first.year, first.month - 1, first.day) / DAY
  const targetDay = Date.UTC(target.year, target.month - 1, target.day) / DAY
  const period = rule.frequency === 'weekly' ? interval * 7 : interval
  return Math.max(0, Math.floor((targetDay - firstDay) / period))
}

export function expandEvents(events, rangeStart, rangeEnd) {
  const output = []
  const lower = startOfDay(rangeStart).getTime()
  const upper = rangeEnd.getTime()
  for (const event of events) {
    const start = new Date(event.start)
    const end = new Date(event.end)
    const duration = end - start
    if (!event.recurrence?.frequency) {
      if (end >= lower && start <= upper) output.push(event)
      continue
    }
    const rule = event.recurrence
    if (!['daily', 'weekly', 'monthly'].includes(rule.frequency)) {
      if (end >= lower && start <= upper) output.push(event)
      continue
    }
    const excluded = new Set(rule.excludedDates || [])
    const until = rule.until || null
    const maxCount = rule.count == null ? Infinity : Math.max(0, Number(rule.count) || 0)
    const firstIndex = firstVisibleOccurrenceIndex(rule, start, lower, duration)
    for (let index = firstIndex; index < maxCount; index += 1) {
      const occurrenceStart = occurrenceFor(rule, start, index)
      const occurrenceDate = recurrenceDateKey(occurrenceStart, rule.timeZone)
      if (occurrenceStart.getTime() > upper || (until && occurrenceDate > until)) break
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration)
      if (occurrenceEnd.getTime() >= lower && !excluded.has(occurrenceDate)) {
        output.push({
          ...event,
          id: index ? `${event.id}__${occurrenceDate}` : event.id,
          seriesId: event.id,
          occurrenceDate,
          start: occurrenceStart.toISOString(),
          end: occurrenceEnd.toISOString(),
        })
      }
    }
  }
  return output
}

export function layoutOverlaps(events) {
  const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start) || new Date(a.end) - new Date(b.end))
  const positioned = []
  let group = []
  let groupEnd = -Infinity

  const flush = () => {
    if (!group.length) return
    const columns = []
    for (const event of group) {
      const start = new Date(event.start).getTime()
      let column = columns.findIndex((end) => end <= start)
      if (column < 0) column = columns.length
      columns[column] = new Date(event.end).getTime()
      positioned.push({ ...event, column, columns: 0 })
    }
    const count = columns.length
    for (let i = positioned.length - group.length; i < positioned.length; i += 1) {
      positioned[i].columns = count
    }
    group = []
    groupEnd = -Infinity
  }

  for (const event of sorted) {
    const start = new Date(event.start).getTime()
    if (group.length && start >= groupEnd) flush()
    group.push(event)
    groupEnd = Math.max(groupEnd, new Date(event.end).getTime())
  }
  flush()
  return positioned
}
