import { useCallback, useEffect, useRef, useState } from 'react'

export function useDragInteraction() {
  const dragRef = useRef(null)
  const frameRef = useRef(0)
  const [preview, setPreview] = useState(null)

  const updatePreview = useCallback((next) => {
    cancelAnimationFrame(frameRef.current)
    if (next == null) {
      setPreview(null)
      return
    }
    frameRef.current = requestAnimationFrame(() => setPreview(next))
  }, [])

  const cancel = useCallback(() => {
    dragRef.current = null
    cancelAnimationFrame(frameRef.current)
    setPreview(null)
  }, [])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])
  return { dragRef, preview, updatePreview, cancel }
}
