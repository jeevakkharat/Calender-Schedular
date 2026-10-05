import assert from 'node:assert/strict'
import test from 'node:test'
import { expandEvents, layoutOverlaps, parseDate, snapDate } from './calendar.js'

test('date parsing rejects impossible calendar days and snapping rounds to 15 minutes', () => {
  assert.equal(parseDate('2026-02-29'), null)
  assert.equal(parseDate('2028-02-29')?.getDate(), 29)
  const snapped = snapDate(new Date(2026, 9, 3, 9, 8))
  assert.equal(snapped.getMinutes(), 15)
})

test('overlap groups receive side-by-side columns and reuse a finished column', () => {
  const event = (id, start, end) => ({ id, start: `2026-10-03T${start}:00Z`, end: `2026-10-03T${end}:00Z` })
  const layout = layoutOverlaps([
    event('a', '09:00', '10:00'),
    event('b', '09:30', '10:30'),
    event('c', '10:00', '11:00'),
  ])
  assert.deepEqual(layout.map(({ id, column, columns }) => [id, column, columns]), [
    ['a', 0, 2],
    ['b', 1, 2],
    ['c', 0, 2],
  ])
})

test('monthly recurrence clamps the 31st to month end and honors count', () => {
  const start = new Date(2026, 0, 31, 9)
  const series = {
    id: 'month-end',
    title: 'Month end',
    start: start.toISOString(),
    end: new Date(start.getTime() + 3600000).toISOString(),
    recurrence: { frequency: 'monthly', interval: 1, count: 3, monthlyType: 'monthDay', timeZone: 'UTC' },
  }
  const instances = expandEvents([series], new Date(2026, 0, 1), new Date(2026, 4, 1))
  assert.deepEqual(instances.map((item) => new Date(item.start).getDate()), [31, 28, 31])
})

test('monthly weekday ordinal repeats the second Tuesday', () => {
  const series = {
    id: 'second-tuesday',
    title: 'Second Tuesday',
    start: '2026-10-13T13:00:00.000Z',
    end: '2026-10-13T14:00:00.000Z',
    recurrence: { frequency: 'monthly', interval: 1, count: 3, monthlyType: 'weekday', weekdayOrdinal: 2, weekday: 2, timeZone: 'America/New_York' },
  }
  const instances = expandEvents([series], new Date('2026-10-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))
  const monthDay = (value) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit' }).format(new Date(value))
  assert.deepEqual(instances.map((item) => monthDay(item.start)), ['10/13', '11/10', '12/08'])
})

test('daily recurrence preserves local wall time through a DST transition', () => {
  const start = new Date('2026-03-07T14:00:00.000Z')
  const series = {
    id: 'dst',
    title: 'DST',
    start: start.toISOString(),
    end: new Date(start.getTime() + 3600000).toISOString(),
    recurrence: { frequency: 'daily', interval: 1, count: 3, timeZone: 'America/New_York' },
  }
  const instances = expandEvents([series], new Date('2026-03-07T00:00:00Z'), new Date('2026-03-10T00:00:00Z'))
  const hourInNewYork = (value) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)))
  assert.deepEqual(instances.map((item) => hourInNewYork(item.start)), [9, 9, 9])
  assert.equal(new Date(instances[1].start) - new Date(instances[0].start), 23 * 3600000)
})

test('unbounded old recurrence seeks to the visible range instead of replaying history', () => {
  const series = {
    id: 'old-daily',
    title: 'Daily',
    start: '2000-01-01T09:00:00.000Z',
    end: '2000-01-01T10:00:00.000Z',
    recurrence: { frequency: 'daily', interval: 1, timeZone: 'UTC' },
  }
  const instances = expandEvents([series], new Date('2026-10-01T00:00:00Z'), new Date('2026-10-08T00:00:00Z'))
  assert.equal(instances.length, 7)
  assert.equal(instances[0].start, '2026-10-01T09:00:00.000Z')
})
