import { useCalendarStore } from '../state/useCalendarStore'

export function useHistory() {
  const { past, future, undo, redo } = useCalendarStore()
  return { canUndo: past.length > 0, canRedo: future.length > 0, undo, redo }
}
