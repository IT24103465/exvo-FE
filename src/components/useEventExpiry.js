import { useEffect, useState } from 'react'
import { eventStartTimestamp } from '../services/eventDateTime'

export function useEventExpiry(events, organizerEvents) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let timer
    const refresh = () => {
      clearTimeout(timer)
      const current = Date.now()
      setNow(current)
      const next = Math.min(
        ...[...events, ...organizerEvents].map(eventStartTimestamp).filter((start) => start >= current),
      )
      if (Number.isFinite(next)) timer = setTimeout(refresh, Math.min(next - current + 1, 2147483647))
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [events, organizerEvents])

  return now
}
