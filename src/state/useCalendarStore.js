import { useContext } from 'react'
import { CalendarContext } from './calendarContext'

export function useCalendarStore() {
  const context = useContext(CalendarContext)
  if (!context) throw new Error('useCalendarStore must be used within CalendarProvider')
  return context
}
